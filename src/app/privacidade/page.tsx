import styles from "./privacy.module.css";

export default function PrivacyPage() {
  return (
    <main className={`container page-section prose ${styles.screen}`}>
      <p className="eyebrow">Privacidade</p>
      <h1>Política de privacidade</h1>
      <p>Coletamos nome, data de nascimento, e-mail, telefone e, quando informado, sexo para registrar a inscrição, verificar duplicidades, aplicar regras da corrida e comunicar informações necessárias sobre o evento.</p>
      <p>Os dados da inscrição são compartilhados com o organizador responsável pela corrida e com a Safe2Pay para processar o pagamento Pix. CPF, telefone e endereço de cobrança são enviados ao provedor e não são armazenados pela Let&apos;sRun. Dados cadastrais e bancários informados pelo organizador são enviados à Safe2Pay para criar a subconta de recebimento e também não são armazenados pela plataforma. A confirmação de pagamento é consultada na API Safe2Pay; não coletamos nem armazenamos dados de cartão.</p>
      <p>O acesso aos dados é limitado às pessoas responsáveis pela corrida. Para solicitar acesso, correção ou exclusão dos dados, entre em contato com o organizador da corrida ou com o administrador da plataforma.</p>
      <p>Ao preencher o formulário de interesse em patrocínio, os dados informados são incluídos em uma mensagem do WhatsApp endereçada à equipe da plataforma. A mensagem só é enviada depois que você a revisar e confirmar no WhatsApp; a plataforma não recebe nem armazena essa conversa.</p>
      <p>O consentimento registrado no momento da inscrição identifica a versão desta política. Esta página deve ser revisada com os dados de contato e prazos de retenção definidos pela operação antes de entrar em produção.</p>
      <p>Este site usa cookies necessários para manter sua sessão e salvar sua preferência neste aviso por até 12 meses. Atualmente, não usamos cookies de publicidade ou análise.</p>
    </main>
  );
}
