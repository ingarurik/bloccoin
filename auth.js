// auth.js - Module d'authentification Supabase

const SUPABASE_URL = 'https://cimyrkybpnssyeyobyrh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_XAfHoy6vcPskEW1vNJaAkA_92iGeE-v';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

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

document.addEventListener('DOMContentLoaded', async () => {
  await verifierSession();
  initialiserModal();
  initialiserMenuCompte();
});

async function verifierSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (session) {
    await chargerProfilEtAfficher(session.user.id);
  } else {
    afficherBoutonConnexion();
  }
}

_supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    await chargerProfilEtAfficher(session.user.id);
    fermerModal();
  } else if (event === 'SIGNED_OUT') {
    profilUtilisateur = null;
    afficherBoutonConnexion();
  }
});

async function chargerProfilEtAfficher(userId) {
  const { data: profil, error } = await _supabase
    .from('profils')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profil) {
    afficherBoutonConnexion();
    return;
  }

  profilUtilisateur = profil;
  afficherPseudo(profil.pseudo_site);
}

function afficherBoutonConnexion() {
  const btn = document.getElementById('btn-connexion');
  const zone = document.getElementById('zone-compte');
  if (btn) btn.style.display = '';
  if (zone) zone.style.display = 'none';
}

function afficherPseudo(pseudo) {
  const btn = document.getElementById('btn-connexion');
  const zone = document.getElementById('zone-compte');
  const nomAffiche = document.getElementById('pseudo-affiche');

  if (btn) btn.style.display = 'none';
  if (zone) zone.style.display = '';
  if (nomAffiche) nomAffiche.textContent = pseudo;
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

  document.querySelectorAll('[data-onglet]').forEach((btn) => {
    btn.addEventListener('click', () => basculerOnglet(btn.dataset.onglet));
  });

  const formConnexion = document.getElementById('form-connexion');
  if (formConnexion) formConnexion.addEventListener('submit', soumettreConnexion);

  const formInscription = document.getElementById('form-inscription');
  if (formInscription) formInscription.addEventListener('submit', soumettreInscription);

  document.querySelectorAll('[data-google-auth]').forEach((btn) => {
    btn.addEventListener('click', connexionGoogle);
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

function basculerOnglet(onglet) {
  document.querySelectorAll('[data-onglet]').forEach((btn) => {
    btn.classList.toggle('actif', btn.dataset.onglet === onglet);
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
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) afficherErreur('err-connexion', traduireErreur(error.message));
}

async function deconnecter() {
  fermerMenuCompte();
  await _supabase.auth.signOut();
}

function initialiserMenuCompte() {
  const pseudoBtn = document.getElementById('pseudo-affiche');
  if (pseudoBtn) pseudoBtn.addEventListener('click', basculerMenuCompte);

  const btnDeconnexion = document.getElementById('btn-deconnexion');
  if (btnDeconnexion) btnDeconnexion.addEventListener('click', deconnecter);

  document.addEventListener('click', (e) => {
    const zone = document.getElementById('zone-compte');
    if (zone && !zone.contains(e.target)) fermerMenuCompte();
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
