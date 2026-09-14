export interface RuntimeSpec {
  name: string;
  entry: string;
  out: string;
  constant: string;
}
export const RUNTIMES: RuntimeSpec[];
export function bundleRuntime(runtime: RuntimeSpec): Promise<string>;
export interface StaticPageSpec {
  name: string;
  source: string;
  out: string;
  constant: string;
}
export const STATIC_PAGES: StaticPageSpec[];
export function staticModule(page: StaticPageSpec): Promise<string>;
