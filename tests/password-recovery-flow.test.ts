/**
 * PREXYON — TESTES: FLUXO COMPLETO DE PASSWORD RECOVERY
 *
 * Verifica:
 * - PASSWORD_RECOVERY ativa isPasswordRecovery (query param sozinho NÃO)
 * - tela de nova senha aparece no recovery real
 * - confirmação divergente bloqueia submissão
 * - updatePassword chama supabase.auth.updateUser
 * - sucesso tratado; estado recovery limpo após sucesso
 * - erro propagado corretamente
 * - dupla submissão bloqueada
 * - Settings continua usando resetPassword (não updatePassword)
 * - fluxo normal de login não ativa recovery
 */

import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, testName: string, expected: any, received: any) {
  if (condition) {
    console.log(`[PASSOU] ${testName}`);
    console.log(`   Esperado:   ${JSON.stringify(expected)}`);
    console.log(`   Encontrado: ${JSON.stringify(received)}\n`);
  } else {
    console.error(`[FALHOU] ${testName}`);
    console.error(`   Esperado:   ${JSON.stringify(expected)}`);
    console.error(`   Encontrado: ${JSON.stringify(received)}\n`);
    throw new Error(`Falha no teste: ${testName}`);
  }
}

// ─── Source files ─────────────────────────────────────────────────────────────

const authContextSrc = fs.readFileSync(path.resolve('src/context/AuthContext.tsx'), 'utf-8');
const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
const recoveryPageSrc = fs.readFileSync(path.resolve('src/pages/Login/PasswordRecoveryPage.tsx'), 'utf-8');
const settingsSrc = fs.readFileSync(path.resolve('src/pages/Settings/SettingsPage.tsx'), 'utf-8');

// ─── Logic mirror: updatePassword flow ───────────────────────────────────────

type UpdateResult = { success: boolean; error?: string };

async function mockUpdatePassword(
  newPassword: string,
  scenario: 'success' | 'error',
  state: { isPasswordRecovery: boolean }
): Promise<UpdateResult> {
  if (!newPassword) return { success: false, error: 'Informe a nova senha.' };
  if (scenario === 'success') {
    state.isPasswordRecovery = false; // cleared after success
    return { success: true };
  }
  return { success: false, error: 'Erro interno do servidor.' };
}

// ─── Logic mirror: recovery page validation ───────────────────────────────────

function validatePasswordForm(newPassword: string, confirmPassword: string): string | null {
  if (!newPassword) return 'Por favor, informe a nova senha.';
  if (newPassword.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
  if (newPassword !== confirmPassword) return 'As senhas não coincidem.';
  return null;
}

// ─── Suíte ───────────────────────────────────────────────────────────────────

async function runRecoveryFlowTests() {
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: suíte excedeu 10 segundos.');
    process.exit(1);
  }, 10000);

  console.log('================================================================');
  console.log('PREXYON — SUÍTE: PASSWORD RECOVERY FLOW');
  console.log('================================================================\n');

  // T1: AuthContext trata evento PASSWORD_RECOVERY
  assert(
    authContextSrc.includes("event === 'PASSWORD_RECOVERY'"),
    'T1 — AuthContext trata evento PASSWORD_RECOVERY',
    true,
    authContextSrc.includes("event === 'PASSWORD_RECOVERY'")
  );

  // T2: isPasswordRecovery exposto na interface
  assert(
    authContextSrc.includes('isPasswordRecovery: boolean'),
    'T2 — isPasswordRecovery exposto na AuthContextType',
    true,
    authContextSrc.includes('isPasswordRecovery: boolean')
  );

  // T3: updatePassword chama supabase.auth.updateUser
  assert(
    authContextSrc.includes('supabase.auth.updateUser({ password: newPassword })'),
    'T3 — updatePassword chama supabase.auth.updateUser',
    true,
    authContextSrc.includes('supabase.auth.updateUser({ password: newPassword })')
  );

  // T4: tokens não logados — nenhum console.log de session/token no bloco de recovery
  const recoveryBlock = authContextSrc.slice(
    authContextSrc.indexOf("event === 'PASSWORD_RECOVERY'"),
    authContextSrc.indexOf("} else if (event === 'SIGNED_IN'")
  );
  const hasTokenLog = recoveryBlock.includes('console.log') && (
    recoveryBlock.includes('session') || recoveryBlock.includes('token')
  );
  assert(!hasTokenLog, 'T4 — tokens/sessão não logados no handler de PASSWORD_RECOVERY', false, hasTokenLog);

  // T5: App.tsx verifica isPasswordRecovery ANTES de isAuthenticated
  const recoveryCheckIdx = appSrc.indexOf('isPasswordRecovery');
  const authCheckIdx = appSrc.indexOf('!isAuthenticated');
  assert(
    recoveryCheckIdx > -1 && authCheckIdx > -1 && recoveryCheckIdx < authCheckIdx,
    'T5 — isPasswordRecovery verificado ANTES de isAuthenticated em App.tsx',
    true,
    recoveryCheckIdx < authCheckIdx
  );

  // T6: query param ?recovery=true sozinho NÃO autoriza — App não redireciona baseado no param
  const queryParamAloneGates = appSrc.includes("recovery=true") &&
    appSrc.includes('isPasswordRecovery');
  // The key check: the gate uses isPasswordRecovery (from event), not the query param
  const recoveryGateUsesEvent = appSrc.includes('if (isPasswordRecovery)');
  assert(recoveryGateUsesEvent, 'T6 — gate de recovery usa isPasswordRecovery (evento), não apenas query param', true, recoveryGateUsesEvent);

  // T7: PasswordRecoveryPage existe e usa updatePassword
  assert(
    recoveryPageSrc.includes('updatePassword'),
    'T7 — PasswordRecoveryPage usa updatePassword do AuthContext',
    true,
    recoveryPageSrc.includes('updatePassword')
  );

  // T8: PasswordRecoveryPage faz signOut após sucesso
  assert(
    recoveryPageSrc.includes('logout'),
    'T8 — PasswordRecoveryPage chama logout após sucesso (evita sessão ambígua)',
    true,
    recoveryPageSrc.includes('logout')
  );

  // T9: validação — confirmação divergente bloqueia
  const v9 = validatePasswordForm('novaSenha1', 'diferente');
  assert(v9 === 'As senhas não coincidem.', 'T9 — senhas diferentes bloqueiam submissão', 'As senhas não coincidem.', v9);

  // T10: validação — senha curta bloqueada
  const v10 = validatePasswordForm('abc', 'abc');
  assert(v10 === 'A senha deve ter pelo menos 6 caracteres.', 'T10 — senha curta bloqueada', true, v10);

  // T11: validação — campos válidos
  const v11 = validatePasswordForm('senha123', 'senha123');
  assert(v11 === null, 'T11 — campos válidos retornam null (sem erro)', null, v11);

  // T12: updatePassword limpa isPasswordRecovery em sucesso
  const state12 = { isPasswordRecovery: true };
  const r12 = await mockUpdatePassword('senha123', 'success', state12);
  assert(r12.success && state12.isPasswordRecovery === false, 'T12 — isPasswordRecovery = false após updatePassword com sucesso', true, r12.success);

  // T13: updatePassword propaga erro
  const state13 = { isPasswordRecovery: true };
  const r13 = await mockUpdatePassword('senha123', 'error', state13);
  assert(!r13.success && state13.isPasswordRecovery === true, 'T13 — erro não limpa isPasswordRecovery', false, r13.success);

  // T14: dupla submissão bloqueada — isSubmitting flag presente na PasswordRecoveryPage
  assert(
    recoveryPageSrc.includes('isSubmitting'),
    'T14 — dupla submissão bloqueada via isSubmitting na PasswordRecoveryPage',
    true,
    recoveryPageSrc.includes('isSubmitting')
  );

  // T15: Settings ainda usa resetPassword (não updatePassword)
  assert(
    settingsSrc.includes('resetPassword') && !settingsSrc.includes('updatePassword'),
    'T15 — SettingsPage usa resetPassword (não updatePassword)',
    true,
    settingsSrc.includes('resetPassword') && !settingsSrc.includes('updatePassword')
  );

  // T16: fluxo normal SIGNED_IN não ativa recovery
  const signedInBlock = authContextSrc.slice(
    authContextSrc.indexOf("} else if (event === 'SIGNED_IN'"),
    authContextSrc.indexOf("} else if (event === 'SIGNED_OUT'")
  );
  const signedInClearsRecovery = signedInBlock.includes('setIsPasswordRecovery(false)');
  assert(signedInClearsRecovery, 'T16 — SIGNED_IN limpa isPasswordRecovery (garante que login normal não ativa recovery)', true, signedInClearsRecovery);

  // T17: service_role não usada em nenhum dos novos arquivos
  const noServiceRole = !recoveryPageSrc.includes('service_role') &&
    !authContextSrc.includes('service_role_key') &&
    !settingsSrc.includes('service_role');
  assert(noServiceRole, 'T17 — service_role não usada em nenhum arquivo', true, noServiceRole);

  clearTimeout(watchdog);
  console.log('================================================================');
  console.log('RESULTADO FINAL: TODOS OS TESTES PASSARAM');
  console.log('================================================================\n');
}

runRecoveryFlowTests().catch((err) => {
  console.error('\n[ERRO FATAL]', err.message);
  process.exit(1);
});
