export interface RuntimeSpec {
  name: string;
  entry: string;
  out: string;
  constant: string;
}
export const RUNTIMES: RuntimeSpec[];
export function bundleRuntime(runtime: RuntimeSpec): Promise<string>;
