import { createOrganizerSafe2PaySubaccount } from "./actions";

export function Safe2PaySubaccountForm() {
  return (
    <form action={createOrganizerSafe2PaySubaccount} className="form-grid">
      <p className="muted">Os dados cadastrais e bancários serão enviados diretamente à Safe2Pay para criar a subconta e não serão armazenados pela Let&apos;sRun.</p>
      <label>Tipo de cadastro
        <select name="accountType" defaultValue="individual" required>
          <option value="individual">Pessoa física</option>
          <option value="company">Pessoa jurídica</option>
        </select>
      </label>
      <label>Nome completo ou razão social<input name="name" required minLength={2} maxLength={160} /></label>
      <label>Nome fantasia (opcional)<input name="commercialName" maxLength={160} /></label>
      <label>CPF ou CNPJ<input name="identity" required autoComplete="off" /></label>
      <label>E-mail cadastral<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
      <div className="form-pair">
        <label>Responsável legal (obrigatório para PJ)<input name="responsibleName" maxLength={160} /></label>
        <label>CPF do responsável (obrigatório para PJ)<input name="responsibleIdentity" inputMode="numeric" maxLength={14} /></label>
      </div>
      <div className="form-pair">
        <label>Data de nascimento do responsável<input name="responsibleBirthDate" type="date" required /></label>
        <label>Telefone do responsável<input name="responsiblePhone" type="tel" required minLength={10} maxLength={16} /></label>
      </div>
      <fieldset className="billing-address-fields">
        <legend>Endereço cadastral</legend>
        <div className="form-pair">
          <label>CEP<input name="zipCode" inputMode="numeric" autoComplete="postal-code" required maxLength={9} /></label>
          <label>Estado (UF)<input name="state" autoComplete="address-level1" required minLength={2} maxLength={2} /></label>
        </div>
        <div className="form-pair">
          <label>Rua<input name="street" autoComplete="street-address" required maxLength={150} /></label>
          <label>Número<input name="number" required maxLength={15} /></label>
        </div>
        <div className="form-pair">
          <label>Bairro<input name="district" required maxLength={60} /></label>
          <label>Cidade<input name="city" autoComplete="address-level2" required maxLength={100} /></label>
        </div>
      </fieldset>
      <fieldset className="billing-address-fields">
        <legend>Conta bancária para repasses</legend>
        <div className="form-pair">
          <label>Código do banco<input name="bank" inputMode="numeric" placeholder="Ex.: 260" required minLength={3} maxLength={3} /></label>
          <label>Tipo de conta<select name="accountTypeCode" defaultValue="CC"><option value="CC">Corrente</option><option value="PP">Poupança</option></select></label>
        </div>
        <div className="form-pair">
          <label>Agência<input name="bankAgency" inputMode="numeric" required maxLength={10} /></label>
          <label>Dígito da agência (opcional)<input name="bankAgencyDigit" maxLength={1} /></label>
        </div>
        <div className="form-pair">
          <label>Conta<input name="bankAccount" inputMode="numeric" required maxLength={15} /></label>
          <label>Dígito da conta<input name="bankAccountDigit" required maxLength={1} /></label>
        </div>
      </fieldset>
      <p className="small muted">O split é 95% para a organização e 5% para a Let&apos;sRun. A frequência de repasse e as tarifas seguem a configuração administrativa da plataforma.</p>
      <label className="check-label"><input name="consent" type="checkbox" required /><span>Autorizo o envio desses dados à Safe2Pay para cadastro da subconta.</span></label>
      <button className="button button-primary">Criar subconta Safe2Pay</button>
    </form>
  );
}
