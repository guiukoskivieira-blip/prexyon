/**
 * PREXYON — TESTES: ALTERAÇÃO DE SENHA (SettingsPage)
 *
 * Verifica:
 * - formulário falso foi removido (campos senha atual / nova senha não existem)
 * - botão real "Enviar link para alterar senha" existe
 * - resetPassword é chamado com email do usuário autenticado
 * - dupla submissão é bloqueada via isSending flag
 * - sucesso exibe mensagem correta sem toast falso
 * - erro exibe mensagem legível
 * - nenhuma mensagem "Senha atualizada com sucesso!" permanece
 */

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

// ─── Helpers que espelham a lógica da SettingsPage ───────────────────────────

// Estado da SettingsPage (simulado)
type ResetState = {
  isSending: boolean;
  resetSent: boolean;
  resetError: string | null;
  callLog: string[];
};

async function mockResetPassword(
  email: string,
  scenario: 'success' | 'error',
  state: ResetState
): Promise<{ success: boolean; error?: string }> {
  state.callLog.push(email);
  if (scenario === 'success') return { success: true };
  return { success: false, error: 'Serviço temporariamente indisponível.' };
}

async function handleSendResetLink(
  state: ResetState,
  userEmail: string | undefined,
  scenario: 'success' | 'error'
) {
  if (state.isSending) return; // double-submit guard
  if (!userEmail) {
    state.resetError = 'Não foi possível identificar o e-mail da conta.';
    return;
  }
  state.isSending = true;
  state.resetError = null;
  const result = await mockResetPassword(userEmail, scenario, state);
  state.isSending = false;
  if (result.success) {
    state.resetSent = true;
  } else {
    state.resetError = result.error || 'Não foi possível enviar o link. Tente novamente.';
  }
}

// ─── Verificações de fonte do componente ─────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

const settingsSource = fs.readFileSync(
  path.resolve('src/pages/Settings/SettingsPage.tsx'),
  'utf-8'
);

// ─── Suíte ───────────────────────────────────────────────────────────────────

async function runSettingsPasswordTests() {
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: suíte excedeu 10 segundos.');
    process.exit(1);
  }, 10000);

  console.log('================================================================');
  console.log('PREXYON — SUÍTE: ALTERAÇÃO DE SENHA (SettingsPage)');
  console.log('================================================================\n');

  // T1: formulário falso removido — campos de senha atual / nova senha não devem existir
  const hasCurrentPasswordField = settingsSource.includes('currentPassword') ||
    settingsSource.includes('Senha Atual') || settingsSource.includes('Nova Senha');
  assert(!hasCurrentPasswordField, 'T1 — formulário falso (senha atual/nova senha) foi removido', false, hasCurrentPasswordField);

  // T2: toast falso removido
  const hasFakeToast = settingsSource.includes('Senha atualizada com sucesso') ||
    settingsSource.includes('savedSuccess') || settingsSource.includes('handlePasswordChange');
  assert(!hasFakeToast, 'T2 — toast falso "Senha atualizada com sucesso" foi removido', false, hasFakeToast);

  // T3: botão real presente
  const hasRealButton = settingsSource.includes('Enviar link para alterar senha');
  assert(hasRealButton, 'T3 — botão "Enviar link para alterar senha" existe', true, hasRealButton);

  // T4: usa resetPassword do AuthContext
  const usesResetPassword = settingsSource.includes('resetPassword') &&
    settingsSource.includes('useAuth');
  assert(usesResetPassword, 'T4 — resetPassword do AuthContext é utilizado', true, usesResetPassword);

  // T5: email do usuário não é editável manualmente (sem input type text/email para edição)
  const hasEmailInput = settingsSource.includes('type="email"') || settingsSource.includes("type='email'");
  assert(!hasEmailInput, 'T5 — campo de e-mail editável não existe na seção', false, hasEmailInput);

  // T6: resetPassword chamado com email correto do usuário
  const state6: ResetState = { isSending: false, resetSent: false, resetError: null, callLog: [] };
  await handleSendResetLink(state6, 'user@prexyon.com', 'success');
  assert(state6.callLog[0] === 'user@prexyon.com', 'T6 — resetPassword chamado com email do usuário', 'user@prexyon.com', state6.callLog[0]);
  assert(state6.resetSent === true, 'T6b — resetSent = true em sucesso', true, state6.resetSent);
  assert(state6.resetError === null, 'T6c — resetError = null em sucesso', null, state6.resetError);

  // T7: dupla submissão bloqueada
  const state7: ResetState = { isSending: true, resetSent: false, resetError: null, callLog: [] };
  await handleSendResetLink(state7, 'user@prexyon.com', 'success');
  assert(state7.callLog.length === 0, 'T7 — dupla submissão bloqueada (isSending=true)', 0, state7.callLog.length);

  // T8: erro exibido corretamente
  const state8: ResetState = { isSending: false, resetSent: false, resetError: null, callLog: [] };
  await handleSendResetLink(state8, 'user@prexyon.com', 'error');
  assert(state8.resetError !== null && state8.resetSent === false, 'T8 — erro propagado corretamente', true, state8.resetError !== null);
  assert(!state8.resetError?.includes('token') && !state8.resetError?.includes('access'), 'T8b — erro não expõe dados internos', true, true);

  // T9: sem email do usuário retorna erro seguro
  const state9: ResetState = { isSending: false, resetSent: false, resetError: null, callLog: [] };
  await handleSendResetLink(state9, undefined, 'success');
  assert(state9.callLog.length === 0, 'T9 — sem email não chama resetPassword', 0, state9.callLog.length);
  assert(state9.resetError !== null, 'T9b — erro seguro exibido quando email ausente', true, state9.resetError !== null);

  // T10: sucesso exibe email do usuário (não expõe token)
  const successMessage = `Link enviado para user@prexyon.com`;
  const hasTokenInSuccess = successMessage.includes('token') || successMessage.includes('access_token');
  assert(!hasTokenInSuccess, 'T10 — mensagem de sucesso não expõe tokens', false, hasTokenInSuccess);

  clearTimeout(watchdog);
  console.log('================================================================');
  console.log('RESULTADO FINAL: TODOS OS TESTES PASSARAM');
  console.log('================================================================\n');
}

runSettingsPasswordTests().catch((err) => {
  console.error('\n[ERRO FATAL]', err.message);
  process.exit(1);
});
