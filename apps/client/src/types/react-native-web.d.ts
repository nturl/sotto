// react-native-web ships no bundled types for its unstable API; declare the one export we use.
declare module 'react-native-web' {
  export function unstable_createElement(
    type: string,
    props?: Record<string, unknown>,
    ...children: unknown[]
  ): JSX.Element;
}
