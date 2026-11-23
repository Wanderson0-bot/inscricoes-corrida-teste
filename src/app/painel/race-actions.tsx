"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteRace } from "@/app/actions";
import styles from "./race-actions.module.css";

export function RaceActions({ raceId, raceName }: { raceId: string; raceName: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="dashboard-race-actions">
      <Link className="button button-outline" href={`/painel/corridas/${raceId}?secao=details`}>Editar</Link>
      <button className="button button-danger" type="button" onClick={() => setConfirming(true)}>Excluir</button>
      {confirming && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setConfirming(false);
      }}>
        <section className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby={`delete-title-${raceId}`} aria-describedby={`delete-description-${raceId}`}>
          <p className={styles.eyebrow}>Confirmar exclusão</p>
          <h2 id={`delete-title-${raceId}`}>Excluir “{raceName}”?</h2>
          <p id={`delete-description-${raceId}`}>A corrida será removida permanentemente. Se ela já tiver inscrições, a exclusão será impedida para preservar o histórico.</p>
          <div className={styles.actions}>
            <button className="button button-outline" type="button" onClick={() => setConfirming(false)}>Manter corrida</button>
            <form action={deleteRace}>
              <input type="hidden" name="raceId" value={raceId} />
              <button className="button button-danger" type="submit">Sim, excluir corrida</button>
            </form>
          </div>
        </section>
      </div>}
    </div>
  );
}
