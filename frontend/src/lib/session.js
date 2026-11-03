import { createSessionStore } from "./sessionStore";
export const session = createSessionStore({ storage: window.localStorage, eventTarget: window });
