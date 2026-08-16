import { Editor, OnMount } from '@monaco-editor/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import debounce from 'lodash.debounce';
import { useConfigContext } from '../context/ConfigContext';
import {
  checkFileBridge,
  readConfigFromFile,
  writeConfigToFile,
} from '../utils/fileBridge';

/**
 * Defines the options for the Monaco Editor instance.
 * @typedef {object} EditorOptions
 * @property {boolean} [readOnly] - If true, the editor will be in read-only mode.
 */
type EditorOptions = {
  readOnly?: boolean;
};

/**
 * Props for the ConfigEditor component.
 * @typedef {object} Props
 * @property {string} [className] - An optional CSS class name for the component's container.
 * @property {EditorOptions} [options] - Optional settings for the Monaco Editor.
 * @property {string} [data-testid] - An optional data-testid attribute for testing purposes.
 */
type Props = {
  className?: string;
  options?: EditorOptions;
  'data-testid'?: string;
  'aria-label'?: string;
};

/**
 * A component that provides a YAML editor for configuring Ergogen settings.
 * It uses the Monaco Editor for a rich editing experience and integrates with the ConfigContext
 * to manage the configuration state.
 *
 * @param {Props} props - The props for the component.
 * @returns {JSX.Element} A container with the Monaco Editor instance.
 */
const ConfigEditor = ({
  className,
  options,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
}: Props) => {
  const configContext = useConfigContext();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // --- Local file bridge state (Save-to-file support, Firefox-compatible) ---
  // Talks to the localhost save-helper server so the editor can read/write the
  // real config.yaml on disk without relying on the (Firefox-unsupported)
  // File System Access API.
  const [fileAvailable, setFileAvailable] = useState<boolean>(false);
  const [filePath, setFilePath] = useState<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const didLoadFromFileRef = useRef<boolean>(false);

  // Provide safe defaults when context is null to avoid conditional hooks
  const defaults = {
    configInput: undefined as string | undefined,
    setConfigInput: ((
      _val: string | undefined
    ) => {}) as unknown as React.Dispatch<
      React.SetStateAction<string | undefined>
    >,
    updateRealtimeConfigInput: (_val: string | undefined) => {},
    injectionInput: undefined as string[][] | undefined,
    generateNow: (async () => {}) as (
      textInput: string | undefined,
      injectionInput: string[][] | undefined,
      options?: { pointsonly: boolean }
    ) => Promise<void>,
    activeConfigId: null as string | null,
  };

  const {
    configInput,
    updateRealtimeConfigInput,
    setConfigInput,
    injectionInput,
    generateNow,
    activeConfigId,
  } = configContext ?? defaults;

  // Create a debounced setConfigInput to avoid updating context on every keystroke
  const debouncedSetConfigInput = useRef(
    debounce((val: string) => {
      setConfigInput(val);
    }, 500)
  ).current;

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSetConfigInput.cancel();
    };
  }, [debouncedSetConfigInput]);

  // Sync editor value with context configInput (only when changed from outside)
  useEffect(() => {
    if (editorRef.current) {
      // If the editor currently has focus, the changes came from user typing.
      // Do not overwrite the editor as that resets the cursor position.
      if (editorRef.current.hasTextFocus()) {
        return;
      }
      const currentVal = editorRef.current.getValue();
      if (configInput !== undefined && configInput !== currentVal) {
        editorRef.current.setValue(configInput);
      }
    }
  }, [configInput]);

  /**
   * Handles changes in the editor's content.
   * Updates the global configuration state if the input is valid.
   * @param {string | undefined} textInput - The new text content from the editor.
   */
  const handleChange = useCallback(
    (textInput: string | undefined) => {
      if (textInput === undefined) return;

      // Sync the realtime value ref immediately (without triggering re-renders)
      updateRealtimeConfigInput(textInput);

      // Debounce the state/localStorage update
      debouncedSetConfigInput(textInput);
    },
    [debouncedSetConfigInput, updateRealtimeConfigInput]
  );

  // On first mount, detect the local save-helper and, if present, seed the
  // editor + context from the real config.yaml on disk so the on-disk file is
  // the source of truth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await checkFileBridge();
      if (cancelled) return;
      setFileAvailable(status.available);
      setFilePath(status.path);
      if (status.available && !didLoadFromFileRef.current) {
        const contents = await readConfigFromFile();
        if (!cancelled && contents !== null && contents.trim() !== '') {
          didLoadFromFileRef.current = true;
          debouncedSetConfigInput.cancel();
          updateRealtimeConfigInput(contents);
          setConfigInput(contents);
          if (editorRef.current) {
            editorRef.current.setValue(contents);
          }
          generateNow(contents, injectionInput, { pointsonly: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Writes the current editor contents to the real config.yaml via the helper.
  const handleSaveToFile = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const contents = editor.getValue();
    setSaveState('saving');
    setSaveMessage('Saving…');
    try {
      // Keep context/localStorage in sync with what we persist to disk.
      debouncedSetConfigInput.cancel();
      updateRealtimeConfigInput(contents);
      setConfigInput(contents);
      const savedPath = await writeConfigToFile(contents);
      setSaveState('saved');
      setSaveMessage(`Saved to ${savedPath.split('/').pop()}`);
      window.setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      setSaveState('error');
      setSaveMessage(`Save failed: ${(e as Error).message}`);
    }
  }, [debouncedSetConfigInput, updateRealtimeConfigInput, setConfigInput]);

  // Keep a ref to the latest save handler so the Monaco action (registered once
  // on mount) always calls the current version.
  const saveHandlerRef = useRef(handleSaveToFile);
  useEffect(() => {
    saveHandlerRef.current = handleSaveToFile;
  }, [handleSaveToFile]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Flush/save changes immediately on blur to ensure download/generate buttons have the latest value
    editor.onDidBlurEditorText(() => {
      debouncedSetConfigInput.flush();
    });

    editor.addAction({
      id: 'generate-config',
      label: 'Generate',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        const currentConfig = editor.getValue();
        // Cancel pending debounces and apply immediately
        debouncedSetConfigInput.cancel();
        updateRealtimeConfigInput(currentConfig);
        setConfigInput(currentConfig);
        generateNow(currentConfig, injectionInput, { pointsonly: false });
      },
    });

    // Save-to-file action (Ctrl/Cmd+S). Writes to the real config.yaml on disk
    // via the localhost save-helper. Uses a ref so it always calls the latest
    // handler closure.
    editor.addAction({
      id: 'save-config-to-file',
      label: 'Save config to file',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        void saveHandlerRef.current();
      },
    });
  };

  if (!configContext) return null;

  const saveColor =
    saveState === 'error'
      ? '#c0392b'
      : saveState === 'saved'
        ? '#27ae60'
        : '#37a779';

  return (
    <div
      className={className}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      style={{ position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 20,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {saveMessage && (
          <span
            style={{
              fontSize: 12,
              color: saveColor,
              background: 'rgba(0,0,0,0.55)',
              padding: '2px 8px',
              borderRadius: 4,
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {saveMessage}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSaveToFile()}
          disabled={!fileAvailable || saveState === 'saving'}
          title={
            fileAvailable
              ? `Save to ${filePath || 'config.yaml'} (Ctrl/Cmd+S)`
              : 'Save helper not running — start it via start.sh'
          }
          aria-label="Save config to file"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: fileAvailable ? saveColor : '#555',
            border: 'none',
            borderRadius: 4,
            padding: '4px 12px',
            cursor: fileAvailable ? 'pointer' : 'not-allowed',
            opacity: saveState === 'saving' ? 0.7 : 1,
          }}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save to File'}
        </button>
      </div>
      <Editor
        key={activeConfigId || 'preview'}
        height="100%"
        defaultLanguage="yaml"
        language="yaml"
        onChange={handleChange}
        onMount={handleEditorDidMount}
        defaultValue={configInput}
        theme={'ergogen-theme'}
        options={options || undefined}
      />
    </div>
  );
};

export default ConfigEditor;
