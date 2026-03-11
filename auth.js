// auth.js - Module d'authentification Supabase

const SUPABASE_URL = 'https://cimyrkybpnssyeyobyrh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_XAfHoy6vcPskEW1vNJaAkA_92iGeE-v';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

const ERREURS = {
  'User already registered': 'Cette adresse email est deja utilisee.',
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': 'Ton email n\'est pas encore confirme. Verifie ta boite mail.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caracteres.',
  'Unable to validate email address': 'Adresse email invalide.',
  'duplicate key value violates unique constraint "profils_pseudo_site_key"': 'Ce pseudo est deja pris.'
};

function traduireErreur(message) {
  for (const [clef, trad] of Object.entries(ERREURS)) {
    if (message && message.includes(clef)) return trad;
  }
  return message || 'Une erreur est survenue, reessaie.';
}

let profilUtilisateur = null;
let authStateProcessing = false;

document.addEventListener('DOMContentLoaded', async () => {
  initialiserModal();
  initialiserMenuCompte();

  try {
    afficherErreurOAuthRetour();
    await verifierSession();
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
    'provider_refresh_token'
  ];

  paramsOAuth.forEach((p) => url.searchParams.delete(p));
  const urlNettoyee = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
  window.history.replaceState({}, document.title, urlNettoyee);
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
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
      await chargerProfilEtAfficher(session.user);
      return;
    }
    afficherBoutonConnexion();
  } catch (err) {
    console.error('Erreur verification session:', err);
    afficherBoutonConnexion();
  }
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
  }
  if (zone) zone.style.display = 'none';
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

function afficherPseudo(valeurAffichee) {
  const btn = document.getElementById('btn-connexion');
  const btnCompte = document.getElementById('btn-compte');
  const zone = document.getElementById('zone-compte');
  const nomAffiche = document.getElementById('pseudo-affiche');

  if (btn) btn.style.display = 'none';
  if (btnCompte) {
    btnCompte.style.display = 'inline-block';
    btnCompte.textContent = `Compte: ${valeurAffichee}`;
  }
  if (zone) zone.style.display = 'none';
  if (nomAffiche) nomAffiche.textContent = valeurAffichee;
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
    : 'https://bloccoin.pages.dev/auth-callback.html';

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
  await _supabase.auth.signOut();
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
