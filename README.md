# Marée Jersey

Application de mise en relation entre les pêcheurs de Jersey et les restaurants locaux pour proposer la pêche du jour, fraîche et traçable.

## Stack

- TanStack Start, React, TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security et Realtime
- Bun pour l'installation et les scripts
- Nitro / Cloudflare Workers pour l'hébergement prévu

## Développement local

```sh
git clone https://github.com/alesk44/Maree.git
cd Maree
bun install
bun run dev
```

## Vérifications

```sh
bun run build
bunx tsc --noEmit
bun run lint
bun run test
```

Le workflow GitHub Actions exécute ces contrôles sur la branche de travail. Le build et les workflows de vérification dédiés sont actuellement verts sur le dernier commit audité ; le workflow CI complet doit encore être confirmé.

## Fonctionnalités connectées à Supabase sur la branche de travail

- Catalogue public : lots disponibles et profils de pêcheurs, actualisés en temps réel.
- Espace restaurant : connexion, réservation transactionnelle, historique des commandes du compte.
- Espace pêcheur : accès réservé au rôle pêcheur, publication et gestion de ses prises, suivi des commandes.
- RPC `reserve_catch` : réservation transactionnelle avec contrôle du stock.
- RPC `update_order_status` : changement sécurisé du statut d'une commande par le pêcheur concerné.

Les permissions de base de données et les migrations doivent être relues avant toute mise en production. Les contrôles automatisés ne remplacent pas les tests de bout en bout avec un vrai compte restaurant et un vrai compte pêcheur.

## Configuration Supabase

Le navigateur utilise uniquement l'URL du projet et la clé publishable. La clé `service_role` ne doit jamais être placée dans le code client, dans les variables `VITE_*` ou dans Git.

Variables optionnelles :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Avant d'inviter des utilisateurs, configurer dans Supabase Auth :
- Site URL et URL de redirection autorisées pour le domaine de prévisualisation puis le domaine final.
- Confirmation d'e-mail, réinitialisation du mot de passe et SMTP fiable.
- Attribution des rôles pêcheur et administrateur via un processus de confiance, jamais par un champ libre contrôlé par l'utilisateur.

Les alertes e-mail nécessitent un fournisseur e-mail configuré côté serveur/Edge Function. Ne jamais exposer de secret Resend dans le frontend ou dans Git.

## Déploiement

Le déploiement Cloudflare n'est pas effectué automatiquement. Créer d'abord une prévisualisation de la branche, vérifier les routes et les parcours sur mobile/ordinateur, puis faire approuver le résultat. La production ne doit être déployée qu'après approbation explicite du propriétaire.

## État du projet et limites connues

- Le travail actuel est isolé sur `feature/supabase-shared-data-v2` et la PR #2 est maintenue en brouillon.
- La version `main` n'a pas été fusionnée ni remplacée.
- Le test inter-comptes pêcheur → restaurant → pêcheur reste à effectuer.
- Les données réelles de catalogue et de commandes doivent être confirmées ; ne pas présenter les données de démonstration comme des ventes ou disponibilités réelles.
- Le nouveau tableau de bord sombre inspiré de la référence fournie reste à intégrer.
- Paiement, notifications e-mail fiables, conformité locale, traçabilité opérationnelle et conditions de livraison doivent être finalisés avant un lancement commercial.

Voir [roadmap.md](./roadmap.md) pour la liste détaillée, les blocages et les critères de mise en production.
