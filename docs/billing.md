# Prexyon — Arquitetura de Cobrança e Integração Financeira

Este documento descreve a arquitetura oficial de pagamentos, cobrança recorrente, webhooks e entitlements do ecossistema Prexyon com o Mercado Pago.

---

## 1. Princípios Arquiteturais

1. **Zero Autoridade no Frontend**: O cliente Web nunca determina preços, moedas, status de pagamento ou concessão de acesso. O frontend solicita intenções de pagamento; o servidor consulta o catálogo oficial (`public.prexyon_plans`) e gera sessões com preços expressos em centavos.
2. **Provedor Abstraído (`PaymentProvider`)**: A lógica de domínio (planos, periodicidade, entitlements) é desacoplada do gateway concreto (Mercado Pago).
3. **Idempotência Estrita**: Webhooks são registrados em `public.prexyon_webhook_events` com chave única `UNIQUE(provider, provider_event_id)` para impedir cobranças ou renovações duplicadas.
4. **Segurança de Segredos**: Credenciais e chaves secretas (`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`) residem exclusivamente no backend / Edge Functions do Supabase, nunca em variáveis com prefixo `VITE_` ou no cliente.

---

## 2. Catálogo Oficial de Planos

| Código do Plano | Nome Oficial | Preço Mensal | Preço Anual | Usuários Inclusos | Softwares Inclusos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `orcagraf` | **OrçaGraf** | R$ 59,90 (5.990¢) | R$ 599,00 (59.900¢) | 3 | OrçaGraf |
| `arteflow` | **ArteFlow** | R$ 79,90 (7.990¢) | R$ 799,00 (79.900¢) | 3 | ArteFlow |
| `artecheck` | **ArteCheck** | R$ 69,90 (6.990¢) | R$ 699,00 (69.900¢) | 3 | ArteCheck |
| `orcagraf_arteflow` | **OrçaGraf + ArteFlow** | R$ 119,90 (11.990¢) | R$ 1.199,00 (119.900¢) | 3 | OrçaGraf, ArteFlow |
| `prexyon_complete` | **Prexyon Completo** ⭐ | R$ 159,90 (15.990¢) | R$ 1.599,00 (159.900¢) | 3 | OrçaGraf, ArteFlow, ArteCheck |

*Usuário Adicional*: Base de R$ 12,90/mês (1.290 centavos) por assento extra.

---

## 3. Fluxo de Contratação e Pagamento

```
Usuário (Owner/Admin)
       ↓ Seleciona Plano e Ciclo (Mensal / Anual)
Frontend invoca Edge Function: prexyon-create-checkout
       ↓
Servidor valida JWT + Role (Owner/Admin) + Busca preço em centavos em prexyon_plans
       ↓
Cria Preference no Mercado Pago com external_reference: "org_<org_id>:<plan_code>:<interval>"
       ↓
Redireciona para o Checkout Seguro do Mercado Pago
       ↓
Pagamento Aprovado pelo Pagador
       ↓
Mercado Pago envia Webhook: prexyon-payment-webhook
       ↓
Servidor consome idempotentemente, atualiza prexyon_subscriptions = active
       ↓
Trigger trg_prexyon_sync_sub_projections sincroniza product_subscriptions
       ↓
Entitlements liberados imediatamente no Portal Prexyon e via SSO no OrçaGraf
```

---

## 4. Variáveis de Ambiente e Configuração

### Variáveis Públicas (Frontend)
```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_PREXYON_PORTAL_URL=https://portal.prexyon.com
```

### Variáveis Secretas (Edge Functions / Supabase Secrets)
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
MERCADO_PAGO_ACCESS_TOKEN=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx # (ou APP_USR- em prod)
MERCADO_PAGO_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORTAL_URL=https://portal.prexyon.com
```

---

## 5. Ciclo de Vida e Políticas de Vigência

- **Vigência Ativa**: `status = 'active'` com `current_period_end > now()`.
- **Cancelamento Solicitado**: `cancel_at_period_end = true`. O cliente continua utilizando todos os produtos contratados até o encerramento de `current_period_end`.
- **Falha de Cobrança / Grace Period**: Durante até 3 dias após a falha de cobrança, a assinatura entra em `past_due`, permitindo a regularização sem interrupção imediata de emergência.
- **Expiração**: Após o término do período ou do grace period sem regularização, a assinatura torna-se `expired`/`canceled`, revogando o entitlement de abertura dos softwares.

---

## 6. Procedimento de Transição para Produção

1. Obter credenciais de Produção no Painel de Desenvolvedores do Mercado Pago (`APP_USR-...`).
2. Configurar a URL de Webhook no painel do Mercado Pago apontando para:
   `https://<project-ref>.supabase.co/functions/v1/prexyon-payment-webhook`
3. Atualizar a secret `MERCADO_PAGO_ACCESS_TOKEN` no Supabase via CLI:
   ```bash
   supabase secrets set MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...
   ```
4. Realizar uma transação de validação com valor mínimo para confirmação de reconciliação ponta a ponta.
