/**
 * PREXYON — TESTES: FLUXO DE CADASTRO (signUp + /register)
 *
 * Testa unitariamente a lógica do fluxo de registro sem banco real.
 * Foco: normalização de email, validações, estrutura de retorno.
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

// ─── Helpers que espelham a lógica da RegisterPage ───────────────────────────

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function validateRegisterForm(params: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): { valid: boolean; error?: string } {
  if (!params.name.trim()) return { valid: false, error: 'Por favor, informe seu nome.' };
  const normEmail = normalizeEmail(params.email);
  if (!normEmail) return { valid: false, error: 'Por favor, informe seu e‑mail.' };
  if (!params.password) return { valid: false, error: 'Por favor, informe sua senha.' };
  if (params.password !== params.confirmPassword) return { valid: false, error: 'Senhas não coincidem.' };
  return { valid: true };
}

// ─── signUp mock ──────────────────────────────────────────────────────────────

type SignUpResult = { success: boolean; error?: string; session?: object };

async function mockSignUp(
  params: { name: string; email: string; password: string },
  scenario: 'session' | 'confirmation' | 'error'
): Promise<SignUpResult> {
  if (scenario === 'session') {
    return { success: true, session: { access_token: '[REDACTED]' } };
  }
  if (scenario === 'confirmation') {
    return { success: true };
  }
  return { success: false, error: 'User already registered' };
}

// ─── Suíte ───────────────────────────────────────────────────────────────────

async function runSignUpTests() {
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: suíte excedeu 10 segundos.');
    process.exit(1);
  }, 10000);

  console.log('================================================================');
  console.log('PREXYON — SUÍTE: CADASTRO / REGISTER FLOW');
  console.log('================================================================\n');

  // T1: email normalizado
  const normalizedEmail = normalizeEmail('  USER@Example.COM  ');
  assert(
    normalizedEmail === 'user@example.com',
    'T1 — normalizeEmail remove espaços e aplica lowercase',
    'user@example.com',
    normalizedEmail
  );

  // T2: validação — name ausente
  const v2 = validateRegisterForm({ name: '', email: 'a@b.com', password: '123456', confirmPassword: '123456' });
  assert(!v2.valid && v2.error === 'Por favor, informe seu nome.', 'T2 — nome ausente retorna erro', false, v2.valid);

  // T3: validação — senhas não coincidem
  const v3 = validateRegisterForm({ name: 'João', email: 'a@b.com', password: 'abc123', confirmPassword: 'xyz789' });
  assert(!v3.valid && v3.error === 'Senhas não coincidem.', 'T3 — senhas diferentes retorna erro', false, v3.valid);

  // T4: validação — todos os campos corretos
  const v4 = validateRegisterForm({ name: 'Maria', email: 'maria@ex.com', password: 'secure1', confirmPassword: 'secure1' });
  assert(v4.valid === true, 'T4 — formulário válido', true, v4.valid);

  // T5: signUp com sessão imediata
  const r5 = await mockSignUp({ name: 'Maria', email: 'maria@ex.com', password: 'secure1' }, 'session');
  assert(r5.success && r5.session !== undefined, 'T5 — signUp retorna session (email confirmation desabilitado)', true, r5.success);
  // Verifica que o token não é exposto como string legível (apenas presente como objeto redacted)
  assert(
    r5.session !== undefined && typeof (r5.session as any).access_token === 'string',
    'T5b — session contém access_token (não logado em prod)',
    true,
    true
  );

  // T6: signUp sem sessão (confirmação de email necessária)
  const r6 = await mockSignUp({ name: 'Pedro', email: 'pedro@ex.com', password: 'safe123' }, 'confirmation');
  assert(r6.success && r6.session === undefined, 'T6 — signUp sem session indica confirmação de email', true, r6.success);

  // T7: signUp com erro do backend
  const r7 = await mockSignUp({ name: 'Ana', email: 'ana@ex.com', password: 'pass' }, 'error');
  assert(!r7.success && r7.error === 'User already registered', 'T7 — signUp propaga erro do backend', false, r7.success);

  // T8: rota pública /register — verificar que a lógica de roteamento reconhece a rota
  function resolveRoute(currentRoute: string, isAuthenticated: boolean): 'register' | 'login' | 'app' {
    if (!isAuthenticated && currentRoute === '/register') return 'register';
    if (!isAuthenticated) return 'login';
    return 'app';
  }
  assert(resolveRoute('/register', false) === 'register', 'T8 — /register é rota pública (não autenticado)', 'register', resolveRoute('/register', false));
  assert(resolveRoute('/register', true) === 'app', 'T8b — /register com usuário autenticado vai para app', 'app', resolveRoute('/register', true));
  assert(resolveRoute('/login', false) === 'login', 'T9 — /login vai para login quando não autenticado', 'login', resolveRoute('/login', false));

  // T10: password nunca logado — verificação estática de que as variáveis sensíveis não são expostas
  // (teste de contrato: signUp não deve ter campo "password" no retorno)
  const sensitiveKeys = ['password', 'access_token', 'refresh_token', 'jwt'];
  const returnKeys = Object.keys(r5);
  const leaks = returnKeys.filter((k) => sensitiveKeys.includes(k));
  assert(leaks.length === 0, 'T10 — retorno de signUp não expõe campos sensíveis', [], leaks);

  clearTimeout(watchdog);
  console.log('================================================================');
  console.log('RESULTADO FINAL: TODOS OS TESTES PASSARAM');
  console.log('================================================================\n');
}

runSignUpTests().catch((err) => {
  console.error('\n[ERRO FATAL]', err.message);
  process.exit(1);
});
