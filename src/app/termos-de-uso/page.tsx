import type { Metadata } from "next";
import Link from "next/link";
import styles from "../privacidade/privacy.module.css";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Condições de uso da Let'sRun para participantes e organizadores de corridas.",
};

export default function TermsOfUsePage() {
  return (
    <main className={`container page-section prose ${styles.screen}`}>
      <h1>Termos de Uso</h1>
      <p>Versão de 23 de novembro de 2026.</p>
      <p>
        A Let&apos;sRun oferece um calendário de corridas, um sistema de inscrições e um painel de
        gestão para organizadores. Estes Termos se aplicam a visitantes, participantes e organizadores.
      </p>

      <h2>1. Eventos e inscrições</h2>
      <p>
        O organizador é responsável pelas informações que publica e pela realização da corrida,
        incluindo percurso, segurança, entrega de kits, categorias e requisitos de participação.
        Antes de se inscrever, confira as informações da prova e o regulamento divulgado pelo
        organizador. Forneça dados corretos e obtenha a autorização necessária ao inscrever outra pessoa.
      </p>

      <h2>2. Pagamentos e recebimentos</h2>
      <p>
        Nas inscrições pagas, confira a categoria e o preço exibido antes de concluir. A Safe2Pay
        processa o Pix e a inscrição paga é confirmada após a identificação do pagamento.
        Gerar o código Pix deixa a inscrição pendente até a confirmação.
      </p>
      <p>
        Nas novas cobranças com divisão de pagamento habilitada, o split é de 95% para a organização
        e 5% para a Let&apos;sRun. O recebimento depende de uma subconta ativa e das condições de
        repasse e tarifas aplicáveis na Safe2Pay.
      </p>

      <h2>3. Cancelamento, alterações e reembolso</h2>
      <p>
        Para solicitar cancelamento ou reembolso, procure o organizador pelos canais indicados no
        regulamento ou na divulgação da corrida. Informe a prova e a referência da inscrição,
        se disponível. Em caso de adiamento ou cancelamento da prova, o organizador deve informar
        os participantes sobre as opções disponíveis.
      </p>
      <p>
        As condições do evento devem respeitar os direitos previstos na legislação aplicável,
        inclusive o direito de arrependimento do consumidor nas contratações a distância, quando
        aplicável.
      </p>

      <h2>4. Conta e deveres do organizador</h2>
      <p>
        Quem cadastra uma organização deve ter autorização para representá-la, manter os dados
        corretos e proteger suas credenciais. O organizador deve publicar informações atualizadas,
        comunicar alterações relevantes e usar os dados de participantes apenas para finalidades
        legítimas relacionadas à inscrição e ao evento, respeitando a legislação de proteção de dados.
      </p>

      <h2>5. Uso da plataforma</h2>
      <p>
        É proibido usar a plataforma para fraudes, inscrições com dados obtidos sem autorização,
        acesso indevido a contas ou publicação de conteúdo ilícito. A Let&apos;sRun pode restringir
        usos abusivos ou fraudulentos, respeitando os direitos dos usuários e a legislação aplicável.
      </p>

      <h2>6. Privacidade e atualizações</h2>
      <p>
        Consulte a <Link className="text-link" href="/privacidade">Política de Privacidade</Link> para
        saber como os dados pessoais são tratados. Atualizações destes Termos serão publicadas nesta
        página, com indicação da versão e respeito aos direitos já adquiridos.
      </p>
    </main>
  );
}
