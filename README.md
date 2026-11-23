# Let'sRun — inscrições para corridas

Aplicação de inscrição pública e gestão privada de corridas. O projeto usa Next.js 16, Supabase (PostgreSQL + Auth) e Safe2Pay Marketplace para cobranças Pix e split.

## Requisitos

- Node.js 20 ou superior e npm.
- Projeto Supabase.
- Conta Safe2Pay Marketplace ativada e credencial de API apropriada.

As cobranças Pix da Safe2Pay não possuem ambiente sandbox. Não use cobranças reais para testar o aplicativo; os testes locais devem usar mocks.

## Configuração local

1. Instale as dependências com `npm install`.
2. Crie um projeto Supabase e aplique manualmente, uma por vez e em ordem, as migrações em `supabase/migrations/`. Não execute `db push` automaticamente. As migrações anteriores à troca de gateway são histórico e não devem ser editadas.
3. Copie `.env.example` para `.env.local` e configure as variáveis do Supabase, `SAFE2PAY_API_KEY` e `SAFE2PAY_APPLICATION`. A chave permanece apenas no servidor; nunca a exponha no navegador ou em commits.
4. No Supabase Auth, configure a URL do site para `http://localhost:3000`, habilite o cadastro por e-mail e configure a confirmação de e-mail. Em Redirect URLs, adicione `http://localhost:3000/auth/callback`. O cadastro cria uma organização e associa o novo usuário como organizador após a confirmação. Para login Google, habilite o provedor e configure o callback do Supabase no Google Cloud Console.
5. Inicie o aplicativo com `npm run dev` e abra `http://localhost:3000`. A criação de cobranças requer URL pública HTTPS e não funciona em `localhost`.

## Safe2Pay Marketplace

- A integração usa `POST https://payment.safe2pay.com.br/v2/payment` para criar Pix, `GET https://api.safe2pay.com.br/v2/transaction/reference?reference=...` para consultar o estado e `/v2/marketplace/add` e `/v2/marketplace/get` para subcontas. As requisições usam `X-API-KEY`.
- Novas cobranças incluem split de 95% para a subconta ativa do organizador e 5% para a Let'sRun. A parcela de comissão é registrada no ledger somente após confirmação da Safe2Pay; estornos geram reversão.
- A URL de callback de cada cobrança contém um token aleatório de uso específico. A aplicação não confia em campos do callback: usa-o como sinal para consultar a transação pela API autenticada e confere referência, ID, meio e valor antes de atualizar o pagamento. A documentação geral consultada não especifica assinatura nem payload do webhook Pix.
- O estado de aprovação da subconta não é exposto no exemplo documentado da API. Por isso, a ativação exige que um administrador confira a aprovação no painel Safe2Pay e verifique pela API que Pix e repasses estão habilitados.
- A criação da subconta envia à Safe2Pay os dados cadastrais e bancários informados pelo organizador. A Let'sRun guarda somente o ID da subconta e o estado interno; não armazena os dados bancários nem os tokens que a API pode retornar.
- O administrador precisa confirmar que o Marketplace está habilitado para Pix e split, escolher a frequência de repasse (mensal, semanal ou diária) e revisar a política de tarifas. Cobranças ficam desabilitadas até que esses dados e a chave Safe2Pay estejam configurados no servidor.
- O webhook fica em `/api/webhooks/safe2pay`. O callback Safe2Pay não é usado para marcar pagamento sem consulta autenticada à API. Configure a URL pública HTTPS da aplicação em `NEXT_PUBLIC_APP_URL`.

Documentação oficial usada:

- [Criar cobrança e Pix](https://developers.safe2pay.com.br/reference/cobranca-criar.md)
- [Consultar cobrança por referência](https://developers.safe2pay.com.br/reference/cobranca-buscar-por-refer%C3%AAncia.md)
- [Criar subconta Marketplace](https://developers.safe2pay.com.br/docs/mkt-criar-subconta.md)
- [Referência de criação da subconta](https://developers.safe2pay.com.br/reference/marketplace-subconta-criar.md)
- [Consultar subconta](https://developers.safe2pay.com.br/reference/consultar-subconta.md)
- [Ciclo de vida Pix](https://developers.safe2pay.com.br/docs/cobranca-pix-ciclo-vida.md)
- [Política de entrega e retentativa de webhooks](https://developers.safe2pay.com.br/docs/webhooks-overview.md)

## Inscrições e financeiro

- A área privada de organizador mantém corridas, categorias, preços, vagas, equipes, cupons, cortesias e inscrições online/manuais.
- Inscrições pagas usam Safe2Pay Pix. CPF e endereço do atleta são enviados ao provedor para criar a cobrança e não são gravados pela Let'sRun.
- A subconta Safe2Pay do organizador é criada na área Recebimentos. O cadastro de banco e os dados legais são enviados diretamente à Safe2Pay e não são persistidos pela Let'sRun.
- O financeiro administrativo mostra cobranças Safe2Pay, comissões, tarifas reportadas e o histórico de pagamentos Pagar.me existente. Os registros históricos permanecem consultáveis sem chamadas à API Pagar.me e sem alteração dos valores antigos.
- Não há dependência npm do Pagar.me. Nenhum fluxo novo envia cobranças a esse provedor.
- Exportações CSV de inscrições e pagamentos permanecem limitadas à organização autenticada.

## Funcionalidades

- Upload de capas de corrida em JPG, PNG ou WebP (até 5 MB), exibidas nos cards do calendário.
- Página pública com formulário de inscrição, consentimento e pagamento Pix.
- Cadastro assistido de atletas com cobrança Safe2Pay Pix e QR Code/copia e cola.
- Confirmação de pagamentos após consulta autenticada, registro idempotente de eventos e ledger de comissão.
- Isolamento multi-organizador no servidor e no banco via Row Level Security.

## Comandos

```bash
npm run dev
npm run lint
npm test
npm run build
```

Antes de produção, confirme a ativação Marketplace e as tarifas com a Safe2Pay, revise contatos e prazos de retenção da política de privacidade e valide os procedimentos de atendimento a solicitações LGPD. Não teste Pix com pagamentos reais.
