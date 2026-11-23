"use client";

import type { FormEvent } from "react";
import styles from "./sponsor-form.module.css";

const sponsorWhatsAppNumber = "5585981101269";

export function SponsorForm() {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const message = [
      "Olá! Tenho interesse em ser patrocinador.",
      "",
      `Nome completo do responsável: ${formData.get("fullName")}`,
      `Empresa ou marca: ${formData.get("companyName")}`,
      `Telefone/WhatsApp: ${formData.get("phone")}`,
      `E-mail comercial: ${formData.get("email")}`,
      `Sobre a empresa ou interesse na parceria: ${formData.get("partnershipDetails")}`,
    ].join("\n");

    window.location.assign(
      `https://wa.me/${sponsorWhatsAppNumber}?text=${encodeURIComponent(message)}`,
    );
  }

  return (
    <form className={`form-grid ${styles.form}`} onSubmit={submit}>
      <label>
        Nome completo do responsável
        <input name="fullName" type="text" autoComplete="name" placeholder="Ex.: Nome Sobrenome" minLength={2} maxLength={160} required />
      </label>
      <label>
        Nome da empresa ou marca
        <input name="companyName" type="text" autoComplete="organization" placeholder="Ex.: Nome da sua marca" minLength={2} maxLength={160} required />
      </label>
      <label>
        Telefone/WhatsApp
        <input name="phone" type="tel" autoComplete="tel" placeholder="Ex.: (00) 00000-0000" maxLength={32} required />
      </label>
      <label>
        E-mail comercial
        <input name="email" type="email" autoComplete="email" placeholder="Ex.: contato@exemplo.com" maxLength={254} required />
      </label>
      <label className={styles.messageField}>
        Conte um pouco sobre sua empresa ou interesse na parceria
        <textarea name="partnershipDetails" rows={4} placeholder="Conte sobre sua empresa, seus produtos ou a parceria que gostaria de propor." minLength={10} maxLength={2000} required />
      </label>
      <p className={styles.privacyNote}>
        Ao continuar, os dados serão incluídos numa mensagem do WhatsApp para você revisar e enviar.
      </p>
      <button className={`button button-primary ${styles.submit}`} type="submit">
        QUERO SER PATROCINADOR
      </button>
    </form>
  );
}
