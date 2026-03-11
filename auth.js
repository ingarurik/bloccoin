// auth.js - Module d'authentification Supabase

const SUPABASE_URL = 'https://cimyrkybpnssyeyobyrh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_XAfHoy6vcPskEW1vNJaAkA_92iGeE-v';
const SUPABASE_AUTH_STORAGE_KEY = 'sb-cimyrkybpnssyeyobyrh-auth-token';
const SUPABASE_AUTH_LOCK_KEY = `lock:${SUPABASE_AUTH_STORAGE_KEY}`;
const COMPTE_UPDATE_TIMEOUT_MS = 25000;

async function verrouAuthLocal(_name, _acquireTimeout, execute) {
  return execute();
}

const _supabase = window.__BLOCCOIN_SUPABASE__ || supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    multiTab: false,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    lock: verrouAuthLocal
  }
});

window.__BLOCCOIN_SUPABASE__ = _supabase;
window.__bloccoinAuthClient = _supabase;

const ERREURS = {
  'User already registered': 'Cette adresse email est deja utilisee.',
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': 'Ton email n\'est pas encore confirme. Verifie ta boite mail.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caracteres.',
  'Unable to validate email address': 'Adresse email invalide.',
  'duplicate key value violates unique constraint "profils_pseudo_site_key"': 'Ce pseudo est deja pris.',
  'timeout:compte_update': 'La mise a jour a mis trop de temps. Reessaie dans quelques secondes.'
};

function traduireErreur(message) {
  for (const [clef, trad] of Object.entries(ERREURS)) {
    if (message && message.includes(clef)) return trad;
  }
  return message || 'Une erreur est survenue, reessaie.';
}

let profilUtilisateur = null;
let authStateProcessing = false;
let sessionCheckPromise = null;
let fileAuthQueue = Promise.resolve();
window.__AUTH_BUILD__ = '20260311-30';
window.AUTH_BUILD = window.__AUTH_BUILD__;

function executerAuthEnSerie(tache) {
  fileAuthQueue = fileAuthQueue.then(tache, tache);
  return fileAuthQueue;
}

function lireSessionStockee() {
  const emplacements = [window.localStorage, window.sessionStorage];

  for (const stockage of emplacements) {
    try {
      const brut = stockage.getItem(SUPABASE_AUTH_STORAGE_KEY);
      if (!brut) continue;

      const data = JSON.parse(brut);
      const session = data?.currentSession || data?.session || data;
      if (sessionValide(session)) return session;
    } catch (_) {
      // Ignore malformed storage value.
    }
  }

  return null;
}

async function getUserParApi(accessToken, timeoutMs = 7000) {
  if (!accessToken) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const reponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${accessToken}`
      },
      signal: controller.signal
    });

    if (!reponse.ok) return null;
    return await reponse.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sessionValide(session) {
  return !!(session && session.user && session.access_token);
}

function estErreurVerrouSupabase(err) {
  const message = String(err?.message || err || '');
  return err?.name === 'AbortError' || message.includes('Lock broken by another request');
}

function estErreurTimeoutAuth(err) {
  const message = String(err?.message || err || '');
  return message.includes('timeout:getSession') || message.includes('timeout:getUser');
}

document.addEventListener('DOMContentLoaded', async () => {
  initialiserModal();
  initialiserMenuCompte();

  try {
    afficherErreurOAuthRetour();
    if (urlIndiqueRetourOAuth()) {
      await forcerSynchroPostOAuth();
    }
    await verifierSession();
    demarrerResynchronisationSession();
  } catch (err) {
    console.error('Erreur initialisation auth:', err);
    afficherBoutonConnexion();
  }
});

function nettoyerParamsOAuthDansUrl() {
  const url = new URL(window.location.href);
  const paramsOAuth = [
    'code',
    'state',
    'error',
    'error_code',
    'error_description',
    'provider_token',
    'provider_refresh_token',
    'auth_return',
    'ts'
  ];

  paramsOAuth.forEach((p) => url.searchParams.delete(p));
  const urlNettoyee = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
  window.history.replaceState({}, document.title, urlNettoyee);
}

function definirEtatConnexionUi(estConnecte) {
  if (estConnecte) {
    document.body.classList.add('auth-connecte');
  } else {
    document.body.classList.remove('auth-connecte');
  }
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function avecTimeout(promesse, ms, libelle) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout:${libelle}`)), ms);
    Promise.resolve(promesse)
      .then((valeur) => {
        clearTimeout(timer);
        resolve(valeur);
      })
      .catch((erreur) => {
        clearTimeout(timer);
        reject(erreur);
      });
  });
}

async function executerOperationCompte(operation) {
  try {
    return await avecTimeout(operation(), COMPTE_UPDATE_TIMEOUT_MS, 'compte_update');
  } catch (err) {
    if (!estErreurTimeoutAuth(err) && !String(err?.message || '').includes('timeout:compte_update')) {
      throw err;
    }

    // Try once again after clearing possible stale auth lock.
    nettoyerVerrouAuthOrphelin();
    await attendre(300);
    return await avecTimeout(operation(), COMPTE_UPDATE_TIMEOUT_MS, 'compte_update');
  }
}

function nettoyerVerrouAuthOrphelin() {
  try {
    window.localStorage.removeItem(SUPABASE_AUTH_LOCK_KEY);
  } catch (_) {
    // Ignore storage access errors.
  }

  try {
    window.sessionStorage.removeItem(SUPABASE_AUTH_LOCK_KEY);
  } catch (_) {
    // Ignore storage access errors.
  }
}

function effacerSessionLocale() {
  profilUtilisateur = null;
  nettoyerVerrouAuthOrphelin();

  try {
    window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  } catch (_) {
    // Ignore storage access errors.
  }

  try {
    window.sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  } catch (_) {
    // Ignore storage access errors.
  }
}

async function getSessionFiable(timeoutMs = 7000) {
  const sessionStockee = lireSessionStockee();
  if (sessionValide(sessionStockee)) {
    return { data: { session: sessionStockee } };
  }

  try {
    return await executerAuthEnSerie(() => avecTimeout(_supabase.auth.getSession(), timeoutMs, 'getSession'));
  } catch (err) {
    if (!estErreurVerrouSupabase(err) && !String(err?.message || '').includes('timeout:getSession')) {
      throw err;
    }

    nettoyerVerrouAuthOrphelin();
    try {
      return await executerAuthEnSerie(() => avecTimeout(_supabase.auth.getSession(), timeoutMs, 'getSession'));
    } catch (_) {
      return { data: { session: null } };
    }
  }
}

async function getUserFiable(timeoutMs = 7000) {
  const sessionStockee = lireSessionStockee();
  const userApi = await getUserParApi(sessionStockee?.access_token, timeoutMs);
  if (userApi?.id) {
    return { data: { user: userApi } };
  }

  try {
    return await executerAuthEnSerie(() => avecTimeout(_supabase.auth.getUser(), timeoutMs, 'getUser'));
  } catch (err) {
    if (!estErreurVerrouSupabase(err) && !String(err?.message || '').includes('timeout:getUser')) {
      throw err;
    }

    nettoyerVerrouAuthOrphelin();
    try {
      return await executerAuthEnSerie(() => avecTimeout(_supabase.auth.getUser(), timeoutMs, 'getUser'));
    } catch (_) {
      return { data: { user: null } };
    }
  }
}

function urlIndiqueRetourOAuth() {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') || params.has('state') || params.get('auth_return') === '1';
}

async function forcerSynchroPostOAuth() {
  const timeoutMs = 15000;
  const delaiMs = 300;
  const debut = Date.now();

  while (Date.now() - debut < timeoutMs) {
    try {
      const { data: { session } } = await getSessionFiable();
      if (sessionValide(session)) {
        await chargerProfilEtAfficher(session.user);
        nettoyerParamsOAuthDansUrl();
        return true;
      }

      // Keep a single auth API call here to reduce lock contention.
    } catch (err) {
      if (!estErreurVerrouSupabase(err) && !estErreurTimeoutAuth(err)) {
        console.warn('Erreur synchro OAuth:', err);
      }
      // Keep retrying until timeout.
    }

    await attendre(delaiMs);
  }

  return false;
}

async function recupererSessionAvecRetry(maxTentatives = 8, delaiMs = 250) {
  for (let i = 0; i < maxTentatives; i++) {
    const { data: { session } } = await getSessionFiable();
    if (sessionValide(session)) return session;
    await attendre(delaiMs);
  }
  return null;
}

function afficherErreurOAuthRetour() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const errorMessage =
    params.get('error_description') ||
    params.get('error') ||
    hash.get('error_description') ||
    hash.get('error');

  if (!errorMessage) return;

  const message = decodeURIComponent(errorMessage).replace(/\+/g, ' ');
  afficherErreur('err-connexion', traduireErreur(message));
  ouvrirModal();

  nettoyerParamsOAuthDansUrl();
}

async function verifierSession() {
  if (sessionCheckPromise) return sessionCheckPromise;

  sessionCheckPromise = (async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const retourOAuth = params.get('auth_return') === '1';
    const session = retourOAuth
      ? await recupererSessionAvecRetry(12, 250)
      : (await getSessionFiable()).data.session;

    if (retourOAuth) {
      nettoyerParamsOAuthDansUrl();
    }

    const { data: { user } } = await getUserFiable();

    if (sessionValide(session) && user?.id) {
      afficherPseudo(formatterAffichageEmail(user.email || session.user?.email || pseudoAffichageDepuisUtilisateur(user)));
      await chargerProfilEtAfficher(user);
      return;
    }

    if (user) {
      afficherPseudo(formatterAffichageEmail(user.email || pseudoAffichageDepuisUtilisateur(user)));
      await chargerProfilEtAfficher(user);
      return;
    }

    if (sessionValide(session)) {
      effacerSessionLocale();
    }

    afficherBoutonConnexion();
  } catch (err) {
    if (estErreurVerrouSupabase(err) || estErreurTimeoutAuth(err)) {
      // Do not force logout UI on transient auth lock races.
      return;
    }
    console.error('Erreur verification session:', err);
    afficherBoutonConnexion();
  } finally {
    sessionCheckPromise = null;
  }
  })();

  return sessionCheckPromise;
}

function demarrerResynchronisationSession() {
  let tentatives = 0;
  const maxTentatives = 8;
  let verificationEnCours = false;
  const interval = setInterval(async () => {
    if (verificationEnCours) return;
    verificationEnCours = true;
    try {
      tentatives += 1;

      const btnConnexion = document.getElementById('btn-connexion');
      const dejaConnecte = btnConnexion && btnConnexion.style.display === 'none';
      if (dejaConnecte) {
        clearInterval(interval);
        return;
      }

      await verifierSession();

      if (tentatives >= maxTentatives) {
        clearInterval(interval);
      }
    } finally {
      verificationEnCours = false;
    }
  }, 1200);

  // Re-synchronise quand l'utilisateur revient sur l'onglet.
  window.addEventListener('focus', () => {
    verifierSession();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      verifierSession();
    }
  });
}

_supabase.auth.onAuthStateChange(async (event, session) => {
  if (authStateProcessing) return;
  authStateProcessing = true;

  try {
    if (event === 'SIGNED_IN' && session) {
      nettoyerParamsOAuthDansUrl();
      await chargerProfilEtAfficher(session.user);
      fermerModal();
    } else if (event === 'SIGNED_OUT') {
      profilUtilisateur = null;
      afficherBoutonConnexion();
    }
  } finally {
    authStateProcessing = false;
  }
});

async function chargerProfilEtAfficher(userOrId) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  const userObj = typeof userOrId === 'string' ? null : userOrId;
  if (!userId) {
    afficherBoutonConnexion();
    return;
  }

  if (userObj) {
    afficherPseudo(formatterAffichageEmail(userObj.email || pseudoAffichageDepuisUtilisateur(userObj)));
  }

  const { data: profil, error } = await _supabase
    .from('profils')
    .select('*')
    .eq('id', userId)
    .single();

  // New OAuth users can exist in auth.users without a row in profils.
  if (error && error.code !== 'PGRST116') {
    if (userObj) {
      afficherPseudo(formatterAffichageEmail(userObj.email || pseudoAffichageDepuisUtilisateur(userObj)));
      return;
    }
    afficherBoutonConnexion();
    return;
  }

  let profilFinal = profil;
  if (!profilFinal && typeof userOrId !== 'string') {
    profilFinal = await creerProfilDepuisUtilisateur(userOrId);
  }

  if (!profilFinal) {
    if (userObj) {
      afficherPseudo(formatterAffichageEmail(userObj.email || pseudoAffichageDepuisUtilisateur(userObj)));
      return;
    }
    afficherBoutonConnexion();
    return;
  }

  profilUtilisateur = profilFinal;
  const emailUtilisateur = userObj?.email || profilFinal.email || '';
  afficherPseudo(formatterAffichageEmail(emailUtilisateur || profilFinal.pseudo_site));
}

function pseudoAffichageDepuisUtilisateur(user) {
  return (
    user?.user_metadata?.name ||
    user?.user_metadata?.preferred_username ||
    ((user?.email || '').split('@')[0] || 'Joueur')
  );
}

function nettoyerPseudo(texte) {
  return (texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 18);
}

function pseudoDepuisUtilisateur(user) {
  const md = user?.user_metadata || {};
  const localPart = (user?.email || '').split('@')[0] || '';
  const base = md.preferred_username || md.user_name || md.name || localPart || 'joueur';
  const nettoye = nettoyerPseudo(base);
  return nettoye.length >= 3 ? nettoye : `joueur${Math.floor(Math.random() * 9000 + 1000)}`;
}

async function creerProfilDepuisUtilisateur(user) {
  if (!user?.id || !user?.email) return null;

  const md = user.user_metadata || {};
  const basePseudo = pseudoDepuisUtilisateur(user);
  const nomPrenom = md.full_name || md.name || basePseudo;
  const pseudoMinecraft = md.preferred_username || basePseudo;

  for (let i = 0; i < 5; i++) {
    const suffixe = i === 0 ? '' : String(Math.floor(Math.random() * 900 + 100));
    const pseudo = `${basePseudo}${suffixe}`.slice(0, 18);

    const { error: errInsert } = await _supabase.from('profils').insert({
      id: user.id,
      pseudo_site: pseudo,
      nom_prenom: nomPrenom,
      email: user.email,
      pseudo_minecraft: pseudoMinecraft
    });

    if (!errInsert) {
      const { data: profilRecup } = await _supabase
        .from('profils')
        .select('*')
        .eq('id', user.id)
        .single();
      return profilRecup || null;
    }

    // Retry with another pseudo when unique constraint is hit.
    if (!String(errInsert.message || '').includes('profils_pseudo_site_key')) {
      return null;
    }
  }

  return null;
}

function afficherBoutonConnexion() {
  const btn = document.getElementById('btn-connexion');
  const btnCompte = document.getElementById('btn-compte');
  const zone = document.getElementById('zone-compte');

  if (btn) btn.style.display = '';
  if (btnCompte) {
    btnCompte.style.display = 'none';
    btnCompte.textContent = 'Compte';
    btnCompte.classList.remove('connecte');
  }
  if (zone) zone.style.display = 'none';
  definirEtatConnexionUi(false);
  fermerFenetreCompte();
}

function formatterAffichageEmail(email) {
  const brut = (email || '').trim();
  if (!brut) return 'Joueur';
  if (brut.toLowerCase().endsWith('@gmail.com')) {
    return brut.slice(0, -'@gmail.com'.length);
  }
  return brut.split('@')[0] || brut;
}

function afficherEditionCompteDesactivee() {
  const el = document.getElementById('err-compte');
  if (!el) return;
  el.textContent = 'La modification des informations est desactivee temporairement.';
  el.style.color = '#ffcf8a';
  el.style.borderColor = 'rgba(240,192,64,0.28)';
  el.style.background = 'rgba(240,192,64,0.09)';
  el.style.display = 'block';
}

function mettreAjourResumeCompte(profil, user) {
  const resumePseudo = document.getElementById('compte-resume-pseudo');
  const resumeMc = document.getElementById('compte-resume-mc');
  const resumeNom = document.getElementById('compte-resume-nom');
  const resumeEmail = document.getElementById('compte-resume-email');

  if (resumePseudo) resumePseudo.textContent = profil?.pseudo_site || formatterAffichageEmail(user?.email || '');
  if (resumeMc) resumeMc.textContent = profil?.pseudo_minecraft || '-';
  if (resumeNom) resumeNom.textContent = profil?.nom_prenom || '-';
  if (resumeEmail) resumeEmail.textContent = user?.email || profil?.email || '-';
}

function remplirFormulaireCompte(profil, user) {
  const champPseudo = document.getElementById('compte-pseudo');
  const champMc = document.getElementById('compte-mc');
  const champNom = document.getElementById('compte-nom');
  const champEmail = document.getElementById('compte-email');
  const champMdpActuel = document.getElementById('compte-mdp-actuel');
  const champMdp = document.getElementById('compte-mdp');
  const champMdpConfirm = document.getElementById('compte-mdp-confirm');

  if (champPseudo) champPseudo.value = profil?.pseudo_site || '';
  if (champMc) champMc.value = profil?.pseudo_minecraft || '';
  if (champNom) champNom.value = profil?.nom_prenom || '';
  if (champEmail) champEmail.value = user?.email || profil?.email || '';
  if (champMdpActuel) champMdpActuel.value = '';
  if (champMdp) champMdp.value = '';
  if (champMdpConfirm) champMdpConfirm.value = '';
  mettreAjourResumeCompte(profil, user);
}

async function recupererUtilisateurCourant() {
  const { data: { user } } = await getUserFiable();
  if (user) return user;

  const session = lireSessionStockee();
  return session?.user || null;
}

async function chargerDonneesCompte() {
  const user = await recupererUtilisateurCourant();
  if (!user?.id) {
    afficherErreur('err-compte', 'Tu dois etre connecte pour modifier ton profil.');
    return;
  }

  let profil = profilUtilisateur;
  if (!profil || profil.id !== user.id) {
    const { data } = await _supabase
      .from('profils')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    profil = data || profil || null;
  }

  profilUtilisateur = profil;
  remplirFormulaireCompte(profil, user);
  viderErreurs();
  afficherEditionCompteDesactivee();
}

function afficherPseudo(valeurAffichee) {
  const btn = document.getElementById('btn-connexion');
  const btnCompte = document.getElementById('btn-compte');
  const zone = document.getElementById('zone-compte');
  const nomAffiche = document.getElementById('pseudo-affiche');

  if (btn) btn.style.display = 'none';
  if (btnCompte) {
    btnCompte.style.display = 'inline-block';
    btnCompte.classList.add('connecte');
    btnCompte.textContent = `Compte: ${valeurAffichee}`;
  }
  if (zone) zone.style.display = 'none';
  if (nomAffiche) nomAffiche.textContent = valeurAffichee;
  definirEtatConnexionUi(true);
}

function initialiserModal() {
  const btnConnexion = document.getElementById('btn-connexion');
  if (btnConnexion) btnConnexion.addEventListener('click', ouvrirModal);

  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fermerModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fermerModal();
  });

  const btnFermer = document.getElementById('auth-fermer');
  if (btnFermer) btnFermer.addEventListener('click', fermerModal);

  document.querySelectorAll('[data-onglet]').forEach((btnOnglet) => {
    btnOnglet.addEventListener('click', () => basculerOnglet(btnOnglet.dataset.onglet));
  });

  const formConnexion = document.getElementById('form-connexion');
  if (formConnexion) formConnexion.addEventListener('submit', soumettreConnexion);

  const formInscription = document.getElementById('form-inscription');
  if (formInscription) formInscription.addEventListener('submit', soumettreInscription);

  document.querySelectorAll('[data-google-auth]').forEach((btnGoogle) => {
    btnGoogle.addEventListener('click', connexionGoogle);
  });
}

function ouvrirModal() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.add('actif');
    document.body.style.overflow = 'hidden';
  }
}

function fermerModal() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('actif');
    document.body.style.overflow = '';
  }
  viderErreurs();
}

function ouvrirFenetreCompte() {
  const overlay = document.getElementById('compte-overlay');
  if (overlay) {
    overlay.classList.add('actif');
    document.body.style.overflow = 'hidden';
  }
  chargerDonneesCompte();
}

function fermerFenetreCompte() {
  const overlay = document.getElementById('compte-overlay');
  if (overlay) {
    overlay.classList.remove('actif');
    document.body.style.overflow = '';
  }
}

function basculerOnglet(onglet) {
  document.querySelectorAll('[data-onglet]').forEach((btnOnglet) => {
    btnOnglet.classList.toggle('actif', btnOnglet.dataset.onglet === onglet);
  });
  document.querySelectorAll('[data-panneau]').forEach((panneau) => {
    panneau.classList.toggle('actif', panneau.dataset.panneau === onglet);
  });
  viderErreurs();
}

async function soumettreConnexion(e) {
  e.preventDefault();
  const email = document.getElementById('cx-email').value.trim();
  const mdp = document.getElementById('cx-mdp').value;

  setChargement('form-connexion', true);
  viderErreurs();

  const { error } = await _supabase.auth.signInWithPassword({ email, password: mdp });

  setChargement('form-connexion', false);
  if (error) afficherErreur('err-connexion', traduireErreur(error.message));
}

async function soumettreInscription(e) {
  e.preventDefault();

  const pseudo_site = document.getElementById('ins-pseudo').value.trim();
  const nom_prenom = document.getElementById('ins-nom').value.trim();
  const email = document.getElementById('ins-email').value.trim();
  const pseudo_minecraft = document.getElementById('ins-mc').value.trim();
  const mdp = document.getElementById('ins-mdp').value;
  const mdp_conf = document.getElementById('ins-mdp-confirm').value;

  if (mdp !== mdp_conf) {
    afficherErreur('err-inscription', 'Les mots de passe ne correspondent pas.');
    return;
  }
  if (pseudo_site.length < 3) {
    afficherErreur('err-inscription', 'Le pseudo doit faire au moins 3 caracteres.');
    return;
  }

  setChargement('form-inscription', true);
  viderErreurs();

  const { data, error: errAuth } = await _supabase.auth.signUp({
    email,
    password: mdp,
    options: {
      data: { pseudo_site }
    }
  });

  if (errAuth) {
    setChargement('form-inscription', false);
    afficherErreur('err-inscription', traduireErreur(errAuth.message));
    return;
  }

  if (data.user) {
    const { error: errProfil } = await _supabase.from('profils').insert({
      id: data.user.id,
      pseudo_site,
      nom_prenom,
      email,
      pseudo_minecraft
    });

    if (errProfil) {
      setChargement('form-inscription', false);
      afficherErreur('err-inscription', traduireErreur(errProfil.message));
      return;
    }
  }

  setChargement('form-inscription', false);
  afficherSucces('err-inscription', 'Compte cree. Verifie ta boite mail pour confirmer ton adresse.');
  document.getElementById('form-inscription').reset();
}

async function connexionGoogle() {
  const callbackUrl = window.location.hostname === 'localhost'
    ? `${window.location.origin}/auth-callback.html`
    : `${window.location.origin}/index.html`;

  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl
    }
  });
  if (error) afficherErreur('err-connexion', traduireErreur(error.message));
}

async function deconnecter() {
  fermerMenuCompte();
  fermerFenetreCompte();
  effacerSessionLocale();
  afficherBoutonConnexion();

  try {
    await avecTimeout(_supabase.auth.signOut({ scope: 'local' }), 3000, 'signOut');
  } catch (_) {
    // Local cleanup already done.
  }
}

async function soumettreCompte(e) {
  e.preventDefault();

  const user = await recupererUtilisateurCourant();
  if (!user?.id) {
    afficherErreur('err-compte', 'Session introuvable. Recharge la page et reconnecte-toi.');
    return;
  }

  const pseudo_site = document.getElementById('compte-pseudo').value.trim();
  const pseudo_minecraft = document.getElementById('compte-mc').value.trim();
  const nom_prenom = document.getElementById('compte-nom').value.trim();
  const email = document.getElementById('compte-email').value.trim();
  const mdp_actuel = document.getElementById('compte-mdp-actuel').value;
  const mdp = document.getElementById('compte-mdp').value;
  const mdp_confirm = document.getElementById('compte-mdp-confirm').value;

  viderErreurs();

  if (pseudo_site.length < 3) {
    afficherErreur('err-compte', 'Le pseudo site doit faire au moins 3 caracteres.');
    return;
  }

  if (!pseudo_minecraft) {
    afficherErreur('err-compte', 'Le pseudo Minecraft est obligatoire.');
    return;
  }

  if (!nom_prenom) {
    afficherErreur('err-compte', 'Le nom et prenom sont obligatoires.');
    return;
  }

  if (!email) {
    afficherErreur('err-compte', 'L\'adresse email est obligatoire.');
    return;
  }

  if (mdp && mdp.length < 6) {
    afficherErreur('err-compte', 'Le mot de passe doit contenir au moins 6 caracteres.');
    return;
  }

  if (mdp && !mdp_actuel) {
    afficherErreur('err-compte', 'Entre ton ancien mot de passe pour le changer.');
    return;
  }

  if (mdp !== mdp_confirm) {
    afficherErreur('err-compte', 'Les mots de passe ne correspondent pas.');
    return;
  }

  setChargement('form-compte', true);

  try {
    if (mdp) {
      const { error: errAuthCourant } = await executerOperationCompte(() =>
        _supabase.auth.signInWithPassword({
          email: user.email || email,
          password: mdp_actuel
        })
      );
      if (errAuthCourant) {
        throw new Error('Ancien mot de passe incorrect.');
      }
    }

    if (email !== (user.email || '')) {
      const { error: errEmail } = await executerOperationCompte(() => _supabase.auth.updateUser({ email }));
      if (errEmail) throw errEmail;
    }

    if (mdp) {
      const { error: errMdp } = await executerOperationCompte(() => _supabase.auth.updateUser({ password: mdp }));
      if (errMdp) throw errMdp;
    }

    const profilMaj = {
      id: user.id,
      pseudo_site,
      pseudo_minecraft,
      nom_prenom,
      email
    };

    const { data: profilSauve, error: errProfil } = await executerOperationCompte(() =>
      _supabase
        .from('profils')
        .upsert(profilMaj)
        .select('*')
        .single()
    );

    if (errProfil) throw errProfil;

    profilUtilisateur = profilSauve || profilMaj;
    afficherPseudo(pseudo_site);
    remplirFormulaireCompte(profilUtilisateur, { ...user, email });

    if (email !== (user.email || '')) {
      afficherSucces('err-compte', 'Profil mis a jour. Verifie ta boite mail pour confirmer le changement d\'email.');
    } else if (mdp) {
      afficherSucces('err-compte', 'Profil et mot de passe mis a jour.');
    } else {
      afficherSucces('err-compte', 'Profil mis a jour.');
    }
  } catch (err) {
    afficherErreur('err-compte', traduireErreur(err?.message || String(err)));
  } finally {
    setChargement('form-compte', false);
  }
}

function initialiserMenuCompte() {
  const pseudoBtn = document.getElementById('pseudo-affiche');
  if (pseudoBtn) pseudoBtn.addEventListener('click', ouvrirFenetreCompte);

  const boutonCompte = document.getElementById('btn-compte');
  if (boutonCompte) boutonCompte.addEventListener('click', ouvrirFenetreCompte);

  const btnFermerFenetre = document.getElementById('compte-fermer');
  if (btnFermerFenetre) btnFermerFenetre.addEventListener('click', fermerFenetreCompte);

  const overlayCompte = document.getElementById('compte-overlay');
  if (overlayCompte) {
    overlayCompte.addEventListener('click', (e) => {
      if (e.target === overlayCompte) fermerFenetreCompte();
    });
  }

  const btnDeconnexion = document.getElementById('btn-deconnexion');
  if (btnDeconnexion) btnDeconnexion.addEventListener('click', deconnecter);

  const btnDeconnexionOverlay = document.getElementById('btn-deconnexion-overlay');
  if (btnDeconnexionOverlay) btnDeconnexionOverlay.addEventListener('click', deconnecter);

  const formCompte = document.getElementById('form-compte');
  if (formCompte) formCompte.addEventListener('submit', soumettreCompte);

  document.addEventListener('click', (e) => {
    const zone = document.getElementById('zone-compte');
    if (zone && !zone.contains(e.target)) fermerMenuCompte();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fermerFenetreCompte();
  });
}

function basculerMenuCompte() {
  const menu = document.getElementById('menu-compte');
  if (menu) menu.classList.toggle('actif');
}

function fermerMenuCompte() {
  const menu = document.getElementById('menu-compte');
  if (menu) menu.classList.remove('actif');
}

function afficherErreur(id, message) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = message;
    el.style.color = '#ff9e9e';
    el.style.display = 'block';
  }
}

function afficherSucces(id, message) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = message;
    el.style.color = '#8bf3b6';
    el.style.display = 'block';
  }
}

function viderErreurs() {
  document.querySelectorAll('[id^="err-"]').forEach((el) => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function setChargement(formId, actif) {
  const form = document.getElementById(formId);
  if (!form) return;
  const btn = form.querySelector('[type="submit"]');
  if (btn) {
    btn.disabled = actif;
    btn.textContent = actif ? 'Chargement...' : (btn.dataset.label || 'Valider');
  }
}

window.__bloccoinAuthCheck = async function __bloccoinAuthCheck() {
  let session = null;
  let user = null;
  let sessionError = null;
  let userError = null;

  try {
    const sessionResp = await getSessionFiable(5000);
    session = sessionResp?.data?.session || null;
  } catch (err) {
    sessionError = String(err?.message || err || 'unknown');
  }

  try {
    const userResp = await getUserFiable(5000);
    user = userResp?.data?.user || null;
  } catch (err) {
    userError = String(err?.message || err || 'unknown');
  }

  return {
    build: window.__AUTH_BUILD__,
    session: sessionValide(session),
    user: !!user,
    sessionError,
    userError
  };
};
