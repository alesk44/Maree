# Marée Jersey — paiement et versements

Date : 2 novembre 2026

## Décision technique provisoire

**Candidat recommandé : Adyen for Platforms**, sous réserve d'une validation commerciale écrite d'Adyen pour l'entité Marée Jersey et de l'ouverture du compte plateforme.

Motifs :
- La documentation Adyen for Platforms inclut le Royaume-Uni « including Channel Islands and Isle of Man » pour l'onboarding des utilisateurs marketplace.
- Le modèle prend en charge l'onboarding/KYC des vendeurs, les paiements en ligne, le partage des fonds, les transferts, les versements et les rapports de rapprochement.
- La documentation précise que les paiements en personne et la création de magasins ne sont pas pris en charge dans les îles Anglo-Normandes ; Marée vise ici les paiements en ligne uniquement.

Stripe n'est pas un choix viable pour une entreprise établie à Jersey : Stripe indique explicitement que les entreprises des dépendances de la Couronne britannique, dont Jersey, ne sont pas actuellement prises en charge. Checkout.com reste une alternative à interroger, mais son éligibilité Jersey et les conditions de son produit marketplace doivent être confirmées directement.

Références :
- Adyen Marketplaces : https://docs.adyen.com/marketplaces
- Adyen split payments : https://docs.adyen.com/marketplaces/process-payments/
- Stripe availability for outlying territories : https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries?locale=en-GB
- Digital Jersey — choosing a payment processor : https://www.digital.je/business-support/choosing-a-payment-processor-in-jersey/

## Répartition commerciale Marée

Pour un prix de vente pêcheur de £100 :
- Montant facturé au restaurant : £106.50
- Montant attribué au pêcheur : £93.50
- Commission brute Marée : £13.00
- Les frais de traitement Adyen sont à chiffrer contractuellement et ne sont pas inclus dans ces montants.

La commission de 13 % est répartie en deux composantes économiques : 6,5 % retenus sur la part pêcheur et 6,5 % ajoutés au montant restaurant. Les arrondis doivent être effectués en pence avec une règle déterministe et les valeurs calculées doivent être figées à la création du paiement.

## Architecture à mettre en place

1. Créer un compte marchand/plateforme Adyen et confirmer par écrit l'éligibilité Jersey, les devises, les frais, les délais de règlement, les réserves, les remboursements et les chargebacks.
2. Onboarder chaque pêcheur comme titulaire de compte Adyen avec KYC/KYB géré par le PSP. Ne jamais collecter ou stocker les données de carte dans Marée.
3. Créer une commande de paiement côté serveur, jamais depuis le navigateur avec des montants libres.
4. Calculer et figer le montant de base, la commission, le montant vendeur et les frais applicables en GBP dans un registre immuable.
5. Utiliser les instructions de split Adyen pour attribuer la part vendeur et la commission Marée.
6. Valider l'état final uniquement depuis des webhooks Adyen authentifiés, idempotents et journalisés.
7. Traiter les remboursements, annulations, litiges et chargebacks avec des écritures compensatoires ; ne jamais réécrire l'historique financier.
8. Rapprocher quotidiennement les paiements, transferts, frais et versements avec les rapports Adyen.

## Garde-fous

- Aucun paiement réel ne doit être activé avant l'accord commercial Adyen, la configuration du compte et la validation des exigences applicables à Jersey.
- Aucun secret Adyen ne doit être stocké dans Git, le navigateur ou les variables VITE_.
- Ne pas annoncer qu'un paiement est réussi sur la seule base d'une redirection navigateur.
- Ne pas effectuer de versement ou remboursement en se fiant uniquement à l'état affiché par le client.
- Les relevés indicatifs actuels ne sont pas des factures fiscales ni un registre de paiement.
