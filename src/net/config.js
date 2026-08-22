// Configurare Supabase pentru jocul ONLINE (Realtime).
// URL-ul și cheia PUBLISHABLE sunt publice prin design (se pun în client);
// securitatea reală ar veni din reguli, iar aici folosim doar Realtime broadcast
// (mesaje efemere între telefoane, fără tabele/date persistente).
export const SUPABASE_URL = 'https://bqnfbyqspwagipdksbvo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_I2kJ9HgrD4LYOiJClNoG_w_L77vQIsR';
