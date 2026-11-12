/**
 * Budget-App – App-Sperre (nur auf diesem Gerät).
 * PIN: als PBKDF2-Hash mit Salz gespeichert, nie im Klartext. Biometrie: Passkey des Geräts (WebAuthn),
 * geprüft wird, dass das Gerät die Person verifiziert hat (Fingerabdruck, Touch ID, Gerätesperre).
 * Schützt die Anzeige vor fremden Blicken; die Daten selbst sind durch das Google-Konto geschützt.
 */
const Sperre = (() => {
  const KEY = 'budget.sperre';
  const lese = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const schreibe = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  let cfg = lese();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const zufall = n => crypto.getRandomValues(new Uint8Array(n));

  async function hash(pin, salz) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salz, iterations: 210000, hash: 'SHA-256' }, key, 256);
    return b64(bits);
  }

  /* ---------- Zustand ---------- */
  const aktiv = () => !!cfg.pinHash;
  const hatBiometrie = () => !!cfg.credId;
  const minuten = () => cfg.minuten ?? 5;
  function setzeMinuten(m) { cfg.minuten = m; schreibe(cfg); }

  /* ---------- PIN ---------- */
  async function pinSetzen(pin) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Die PIN braucht 4 bis 8 Ziffern.');
    const salz = zufall(16);
    cfg.pinHash = await hash(pin, salz); cfg.salz = b64(salz); cfg.fehler = 0; cfg.sperreBis = 0;
    schreibe(cfg);
  }
  async function pinPruefen(pin) {
    const jetzt = Date.now();
    if (cfg.sperreBis && cfg.sperreBis > jetzt) throw new Error(`Zu viele Fehlversuche – bitte ${Math.ceil((cfg.sperreBis - jetzt) / 1000)} s warten.`);
    const ok = (await hash(pin, unb64(cfg.salz))) === cfg.pinHash;
    if (ok) { cfg.fehler = 0; cfg.sperreBis = 0; }
    else {
      cfg.fehler = (cfg.fehler || 0) + 1;
      if (cfg.fehler >= 5) cfg.sperreBis = jetzt + 30000 * 2 ** Math.min(cfg.fehler - 5, 5);   // 30 s, 60 s, 120 s …
    }
    schreibe(cfg);
    return ok;
  }
  function ausschalten() { cfg = { minuten: cfg.minuten }; schreibe(cfg); }

  /* ---------- Biometrie (Passkey) ---------- */
  async function biometrieMoeglich() {
    try {
      if (!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable)) return false;
      // manche Umgebungen antworten nie → nach 1.5 s als «nicht verfügbar» behandeln
      return !!(await Promise.race([PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
        new Promise(r => setTimeout(() => r(false), 1500))]));
    } catch (e) { return false; }
  }
  async function biometrieEinrichten() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: zufall(32),
      rp: { name: 'Budget' },
      user: { id: zufall(16), name: 'budget-app', displayName: 'Budget-App (Sperre)' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none'
    } });
    cfg.credId = b64(cred.rawId); schreibe(cfg);
  }
  async function biometriePruefen() {
    const r = await navigator.credentials.get({ publicKey: {
      challenge: zufall(32), allowCredentials: [{ type: 'public-key', id: unb64(cfg.credId) }],
      userVerification: 'required', timeout: 60000
    } });
    // Flags-Byte 32 der Authenticator-Daten: Bit 2 = Person wurde verifiziert (UV)
    const flags = new Uint8Array(r.response.authenticatorData)[32];
    return !!(flags & 0x04);
  }
  function biometrieEntfernen() { delete cfg.credId; schreibe(cfg); }

  return { aktiv, hatBiometrie, minuten, setzeMinuten, pinSetzen, pinPruefen, ausschalten,
    biometrieMoeglich, biometrieEinrichten, biometriePruefen, biometrieEntfernen };
})();
if (typeof module !== 'undefined') module.exports = Sperre;
