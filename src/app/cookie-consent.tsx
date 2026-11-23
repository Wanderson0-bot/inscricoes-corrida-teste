"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./cookie-consent.module.css";

const consentCookie = "vai-cookie-consent";
const consentMaxAge = 60 * 60 * 24 * 365;

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const savedConsent = document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${consentCookie}=`));

    setVisible(!savedConsent);
  }, []);

  function saveConsent(value: "accepted" | "rejected") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${consentCookie}=${value}; Max-Age=${consentMaxAge}; Path=/; SameSite=Lax${secure}`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className={styles.banner} aria-label="Preferências de cookies">
      <div className={styles.copy}>
        <strong>Privacidade e cookies</strong>
        <p>
          Usamos cookies necessários para manter sua sessão. Não usamos cookies de publicidade ou análise. Registre sua preferência abaixo.
          <Link href="/privacidade"> Saiba mais</Link>
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={`button ${styles.reject}`} onClick={() => saveConsent("rejected")}>
          Recusar
        </button>
        <button type="button" className={`button button-primary ${styles.accept}`} onClick={() => saveConsent("accepted")}>
          Aceitar
        </button>
      </div>
    </aside>
  );
}
