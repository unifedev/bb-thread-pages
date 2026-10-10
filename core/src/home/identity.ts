// `HOME_IDENTITY = "~home"` (never a valid session id), `isHome(id)`, `SESSIONLESS_CAPABILITIES` — the built-in home page's reserved identity (05 R-S12; DESIGN P5).
import { SESSIONLESS_CAPABILITIES } from "../domain/capabilities/specs.ts";
import { HOME_IDENTITY } from "../domain/ids.ts";

export { HOME_IDENTITY, SESSIONLESS_CAPABILITIES };

/** The built-in home page's identity, as a token, a storage namespace or a grant pair names it. 05 R-S12 */
export function isHome(id: unknown): id is typeof HOME_IDENTITY {
  return id === HOME_IDENTITY;
}
