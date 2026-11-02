# Marée Jersey — audit des pépites IA open source

Date : 1 novembre 2026  
Branche : `feature/supabase-shared-data-v2`

## Objectif

Identifier des briques IA utiles au marché local pêcheurs ↔ restaurants, sans ajouter de dépendance payante obligatoire, sans déplacer les données sensibles inutilement et sans transformer une suggestion IA en décision commerciale ou sanitaire.

## Contraintes de l'architecture actuelle

- Frontend/server : TanStack Start + React, déployé sur Cloudflare Workers.
- Données et authentification : Supabase/Postgres.
- CI et livraison : GitHub Actions + Cloudflare preview.
- Le Worker n'héberge pas de modèle LLM local. Un runtime comme Ollama ou LocalAI doit tourner sur une machine ou un serveur distinct, avec disponibilité réseau, mises à jour et supervision.
- Aucun fournisseur de modèle, aucune clé API payante et aucun nouveau service n'est requis par cet audit.

## Pépites sélectionnées

| Projet | Usage possible pour Marée | Compatibilité actuelle | Décision |
|---|---|---|---|
| Localess | Aider à traduire les textes UI et contenus FR/EN/RO | Outil de gestion de traduction distinct du Worker ; le dictionnaire actuel est déjà contrôlé en CI | À surveiller, pas d'installation maintenant |
| LocalAI | Fournir une API de modèle auto-hébergée compatible OpenAI | Nécessite une machine/serveur séparé et un endpoint sécurisé accessible au Worker | Candidat runtime si une machine dédiée devient disponible |
| Ollama | Exécuter localement un modèle pour prototyper un assistant | Très simple en développement local, mais pas joignable depuis Cloudflare sans tunnel sécurisé | Recommandé pour expérimenter, pas comme backend public direct |
| Flowise / Langflow | Prototyper visuellement un assistant et ses étapes | Service Python/Node séparé, charge opérationnelle supplémentaire | Prototype hors production uniquement |
| RAGFlow | Interroger des documents avec récupération de sources | Docker et infrastructure dédiés ; surdimensionné pour la première version | À garder pour un futur centre d'aide documentaire |
| Inspect AI | Évaluer les réponses d'un modèle avec scénarios et critères | Peut tourner dans la CI ou dans un environnement de test séparé | Bonne piste pour une future suite d'évaluation IA |
| iFixAi | Audit adversarial d'agents et de workflows IA | Outil de développement, pas une fonctionnalité utilisateur | À tester avant d'exposer un agent |
| PR-Agent | Revue IA des pull requests | Intégration GitHub possible, mais dépend du modèle/provider et des permissions du bot | Optionnel ; ne pas accorder de droits d'écriture automatiques |

Références principales : [Awesome Selfhosted — GenAI](https://awesome-selfhosted.net/), [Awesome Self-Hosted AI](https://github.com/glincker/awesome-selfhosted-ai), [LocalAI](https://github.com/mudler/LocalAI), [Ollama](https://github.com/ollama/ollama), [Langflow](https://github.com/langflow-ai/langflow), [Flowise](https://github.com/FlowiseAI/Flowise), [RAGFlow](https://github.com/infiniflow/ragflow), [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai), [iFixAi](https://github.com/iFixAi/iFixAi).

Les licences, conditions d'utilisation, besoins matériels et états de maintenance devront être revérifiés avant toute adoption ; les listes de projets ne garantissent ni la gratuité de l'hébergement ni celle des modèles.

## Trois fonctionnalités IA qui auraient une vraie utilité

### 1. Assistant de rédaction de prise — priorité produit

Le pêcheur saisit les faits structurés dans le formulaire habituel : espèce, quantité, prix, zone, heure de capture/débarquement, méthode et consignes de conservation. Un modèle peut proposer une description claire et sa traduction.

Règles impératives :
- Le modèle ne crée ni espèce, ni quantité, ni prix, ni zone, ni date.
- Les champs structurés restent la source de vérité ; le texte généré est facultatif et modifiable.
- Les traductions ne remplacent pas les valeurs originales.
- L'utilisateur confirme avant publication.
- Si aucun modèle n'est configuré, le formulaire normal continue de fonctionner.

### 2. Assistant de recherche pour restaurants — priorité ultérieure

Recherche en langage naturel sur le catalogue réel : « poisson blanc disponible demain, moins de £X/kg ». L'IA peut reformuler la requête, mais les résultats, prix, quantités et créneaux doivent provenir directement de Supabase et être filtrés par le serveur. Pas de génération de stock ou de disponibilité.

### 3. Assistant documentaire conformité — phase ultérieure

Un centre d'aide peut retrouver des réponses dans des documents officiels validés concernant traçabilité, hygiène, chaîne du froid et démarches applicables à Jersey. Réponses avec citation de document et date de mise à jour ; si la source manque, l'assistant doit le dire. Ce module ne délivre aucun avis réglementaire ou sanitaire autonome.

## Ce qu'il ne faut PAS automatiser

- Identifier une espèce ou juger la fraîcheur d'un poisson à partir d'une photo sans validation humaine.
- Décider qu'un produit est propre à la consommation.
- Inventer une disponibilité, un prix, une origine, une méthode de pêche ou une certification.
- Accepter ou refuser automatiquement un pêcheur, un restaurant ou une commande.
- Donner des conseils de navigation/sécurité à partir des seules conditions marines indicatives.

## Architecture recommandée si un modèle est adopté

1. Ajouter un adaptateur serveur optionnel, par exemple `AI_PROVIDER=none|openai_compatible`, avec endpoint et secret stockés uniquement côté serveur.
2. Le Worker appelle un endpoint authentifié et limité en débit ; jamais d'appel modèle depuis le navigateur avec une clé secrète.
3. Valider la sortie avec un schéma Zod strict et rejeter tout champ non prévu.
4. Construire le prompt à partir des seules données déjà validées ; le modèle renvoie seulement les champs de texte demandés.
5. Enregistrer les actions IA et la confirmation humaine, sans conserver de données personnelles superflues.
6. Prévoir un mode `none` : toutes les fonctionnalités principales restent disponibles sans IA.

Ne pas exposer un serveur Ollama/LocalAI directement sur Internet. Un tunnel privé, une authentification forte, des limites de débit et une surveillance sont nécessaires. Un serveur local sur un PC éteint n'est pas un service de production fiable.

## Plan d'action sans dépense obligatoire

- [x] Auditer les outils IA et sélectionner les candidats compatibles avec le projet.
- [ ] Prototyper Ollama sur une machine locale, sans connecter de données réelles.
- [ ] Écrire des cas de test FR/EN/RO pour un assistant de rédaction de prise.
- [ ] Tester que le modèle ne peut pas modifier les données structurées et qu'il signale les informations manquantes.
- [ ] Mesurer qualité, latence et coût d'exploitation avant de choisir un runtime.
- [ ] Seulement après validation : créer un endpoint serveur optionnel avec mode désactivé par défaut.

## Décision

**Ne pas installer Flowise, Langflow, RAGFlow, Ollama ou LocalAI dans l'application actuelle maintenant.** Le gain immédiat ne justifie pas une nouvelle infrastructure et un nouveau point d'attaque. Commencer par un prototype local d'assistant de rédaction, puis choisir le runtime en fonction du matériel réellement disponible et des résultats des tests.

L'IA doit aider à mieux présenter et retrouver les prises ; Supabase reste l'autorité pour les données du marché.
