export{};

declare global {
  interface Window {
    electronAPI: any;
  }
}

declare module '*.png' {
  const value: string;
}

declare module '*.jpg' {
  const value: string;
}

declare module '*.jpeg' {
  const value: string;
}
