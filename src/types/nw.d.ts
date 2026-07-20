declare const nw: {
  Window: {
    open: (url: string, options: Record<string, unknown>, callback?: (win: unknown) => void) => void;
    get: () => {
      isVisible: boolean;
      isMinimized?: boolean;
      _onlykeySuppressShow?: boolean;
      _onlykeyCloseBound?: boolean;
      show: (focus?: boolean) => void;
      hide: () => void;
      focus: () => void;
      restore?: () => void;
      close: (force?: boolean) => void;
      removeAllListeners: (event?: string) => void;
      setShowInTaskbar?: (show: boolean) => void;
      on: (event: string, callback: () => void) => void;
    };
    getAll?: (callback: (wins: Array<ReturnType<(typeof nw)['Window']['get']>>) => void) => void;
  };
  Tray: new (options: { icon: string }) => {
    tooltip: string;
    menu: unknown;
    on: (event: string, callback: () => void) => void;
    remove: () => void;
  };
  Menu: new () => {
    append: (item: unknown) => void;
    remove: (item: unknown) => void;
    insert: (item: unknown, index: number) => void;
  };
  MenuItem: new (options: Record<string, unknown>) => { checked: boolean };
  Shell: {
    openExternal: (url: string) => void;
    showItemInFolder: (path: string) => void;
  };
  App: {
    manifest: { version_name: string };
    startPath: string;
    quit: () => void;
  };
};