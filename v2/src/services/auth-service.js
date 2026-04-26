import { auth, OAuthProvider, signInWithPopup, signOut } from "../firebase.js";
import { MICROSOFT_TENANT } from "../config.js";

export async function signInWithMicrosoft() {
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ tenant: MICROSOFT_TENANT });
  return signInWithPopup(auth, provider);
}

export async function signOutCurrentUser() {
  return signOut(auth);
}
