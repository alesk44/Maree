# Marée Jersey — paiement et versements

Date : 2 novembre 2026

## Décision actuelle

**Paiements volontairement reportés. Aucun prestataire n'est sélectionné et aucun flux de paiement réel ne doit être développé ou activé à ce stade.**

Le propriétaire dispose actuellement d'un compte Revolut personnel. Il ne sera pas utilisé pour encaisser des transactions commerciales de Marée ni pour recevoir ou répartir les fonds des pêcheurs. Un compte personnel n'est pas une infrastructure de paiement marketplace.

Une éventuelle ouverture de Revolut Business et l'accès à Revolut Merchant devront être confirmés séparément pour une société établie à Jersey. L'éligibilité du pays, les conditions contractuelles et la capacité de répartir les fonds entre Marée et les pêcheurs restent à confirmer directement auprès de Revolut. Aucun choix de prestataire ne doit être déduit de la seule disponibilité d'un compte Business.

Stripe n'est pas considéré comme une option pour une entreprise établie à Jersey selon sa liste de territoires pris en charge. Tout autre PSP (dont Adyen ou Checkout.com) reste une piste à réévaluer plus tard, après confirmation écrite de l'éligibilité et du produit marketplace.

Références à revalider au moment de reprendre le chantier :
- Revolut Business : https://www.revolut.com/business/
- Revolut Merchant : https://www.revolut.com/business/accept-payments/
- Stripe availability for outlying territories : https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries?locale=en-GB
- Digital Jersey — choosing a payment processor : https://www.digital.je/business-support/choosing-a-payment-processor-in-jersey/

## Répartition commerciale cible — non active

Pour un prix de vente pêcheur de £100 :
- Montant cible facturé au restaurant : £106.50
- Montant cible attribué au pêcheur : £93.50
- Commission brute cible Marée : £13.00

La commission cible de 13 % comporte deux composantes : 6,5 % ajoutés au montant restaurant et 6,5 % déduits du montant pêcheur. Ces valeurs sont des simulations commerciales uniquement : elles ne sont ni facturées, ni prélevées, ni versées. Les frais éventuels du prestataire ne sont pas inclus.

## Architecture à prévoir lorsque le chantier reprendra

1. Obtenir une confirmation écrite que le PSP accepte l'entité Marée Jersey et le modèle marketplace.
2. Confirmer les devises, frais, délais de règlement, réserves, remboursements, litiges et chargebacks.
3. Faire onboarder les pêcheurs avec KYC/KYB géré par le PSP ; Marée ne collecte ni ne stocke les données de carte.
4. Créer les intentions de paiement exclusivement côté serveur, avec montants calculés et validés côté serveur.
5. Figer les montants GBP, les commissions et les frais dans un registre financier immuable.
6. Valider les paiements uniquement à partir de webhooks authentifiés, idempotents et journalisés.
7. Traiter remboursements, annulations et litiges par écritures compensatoires.
8. Rapprocher quotidiennement paiements, frais, transferts et versements.

## Garde-fous

- Aucun paiement réel, faux paiement de démonstration présenté comme réel, virement ou remboursement ne doit être activé.
- Aucun secret de prestataire dans Git, le navigateur ou une variable VITE_.
- Une redirection navigateur ne constitue jamais une preuve de paiement.
- Les relevés indicatifs actuels ne sont ni des factures fiscales ni un registre de paiement.
- La reprise du chantier nécessite une décision explicite du propriétaire et une validation écrite du prestataire pour Jersey.
