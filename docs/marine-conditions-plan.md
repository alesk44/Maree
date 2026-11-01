# Marée Jersey — cadrage du module « Conditions en mer »

Statut : proposition technique, non déployée  
Date : 1 novembre 2026

## Objectif produit

Afficher aux pêcheurs et restaurants un aperçu informatif des conditions marines autour de Jersey. Le module doit aider à contextualiser les disponibilités et les retards potentiels, sans prétendre indiquer si une sortie en mer est sûre.

## Source candidate

- Open-Meteo Marine API : https://open-meteo.com/en/docs/marine-weather-api
- Vérifier les conditions d'utilisation et les limites de requêtes avant activation.
- Ne pas stocker de données personnelles dans les requêtes.
- Prévoir un cache côté serveur/edge afin d'éviter une requête externe à chaque affichage.
- Afficher l'heure de dernière mise à jour et un état « données indisponibles » en cas d'échec.

## Données candidates

- Hauteur significative des vagues.
- Direction et période des vagues, si disponibles.
- Hauteur des vagues de vent.
- Température de surface de la mer, si disponible.

Le vent, les marées, les courants locaux, les avis officiels et les conditions portuaires ne doivent pas être déduits de champs non fournis. Afficher uniquement les variables réellement renvoyées par l'API.

## UX proposée

- Petit panneau « Conditions en mer » sur l'accueil et/ou l'espace pêcheur.
- Valeurs en unités explicites (mètres, degrés Celsius).
- Heure de validité locale et mention de la source.
- Chargement, erreur et absence de données gérés proprement.
- Pas de carte ou d'indication de zone de pêche tant que les coordonnées et la précision des données ne sont pas validées.

## Architecture cible

1. Un endpoint serveur/edge récupère les données météo marines.
2. Le serveur valide et normalise la réponse.
3. Cache court avec durée configurable ; en cas d'échec, ne pas présenter des données périmées comme actuelles.
4. Le client affiche uniquement la réponse normalisée.
5. Tests unitaires pour réponse valide, champ manquant, timeout, erreur HTTP et données périmées.

## Sécurité et limites

- Ne jamais exposer une clé privée ou un secret côté navigateur.
- Ne pas faire dépendre la réservation ou le stock de la météo.
- Ne pas utiliser ce module comme avis de navigation, météo officielle, ni recommandation de sécurité.
- Les pêcheurs restent responsables de consulter les bulletins et autorités maritimes officiels.

## Critères d'acceptation

- Les unités et horodatages sont exacts.
- L'interface indique la source et la fraîcheur des données.
- Les états chargement/erreur sont testés.
- Aucun changement de schéma Supabase n'est requis pour la première version.
- Le module est désactivable par configuration.
- Build, lint, tests et aperçu privé réussissent avant toute validation.
