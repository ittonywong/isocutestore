/*
 * 網店初形設定 — Shop preview configuration
 *
 * DEMO_MODE = true  ：本機預覽（種子產品 + localStorage；唔需要 Supabase key）
 * DEMO_MODE = false ：接真實 Supabase（填 URL + anon/publishable key）
 *
 * ⚠️ 絕對唔好放 secret key（sb_secret_…）或 service_role key！
 */
window.SHOP_CONFIG = {
  DEMO_MODE: true,
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-SUPABASE-PUBLISHABLE-OR-ANON-KEY",
  PRIVACY_CONTACT: "YOUR-CONTACT-EMAIL@example.com",
  MIN_PASSWORD_LENGTH: 8,
  /* Demo-only accounts (preview). Real mode uses Supabase Auth. */
  DEMO_ADMIN_EMAIL: "admin@demo.local",
  DEMO_MEMBER_EMAIL: "demo@demo.local",
  APP_NAME: "3D Shop"
};
