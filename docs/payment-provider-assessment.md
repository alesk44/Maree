# Marée Jersey — paiement et versements

Date : 25 novembre 2026

## Décision actuelle

**Modèle retenu : les restaurants et les pêcheurs se facturent directement leurs produits par facture envoyée par e-mail. Marée facture aux restaurants un abonnement de 19,99 £ par mois civil complet, ainsi que les frais de commande existants, regroupés sur une échéance mensuelle. L'abonnement commence uniquement après acceptation explicite ; il n'est pas proratisé et la résiliation prend effet à la fin du mois civil. Aucun paiement en ligne n'est actif aujourd'hui ; le paiement Revolut Pro reste à activer après confirmation de l'éligibilité à Jersey.**

Revolut Pro est un espace professionnel séparé dans l'application personnelle Revolut. Il est réservé à une personne physique indépendante, pas à une société ou à un partenariat. Le compte personnel standard ne sera pas utilisé pour Marée.

Revolut Pro propose des liens de paiement et des factures depuis l'application après acceptation au service de traitement des paiements. Les conditions limitent ces encaissements aux propres ventes de l'indépendant et interdisent de traiter les paiements au nom d'un tiers. Marée ne doit donc utiliser Pro que pour sa propre prestation d'accès à l'application et ses frais de service, si l'exploitant indépendant en est bien le fournisseur légal. Les ventes de poisson des pêcheurs doivent être réglées directement aux pêcheurs.

Les pages Revolut consultées ne confirment pas l'éligibilité de Pro ni du traitement des paiements pour un résident de Jersey : une page d'aide Pro indique une disponibilité au Royaume-Uni et dans l'EEE, sans citer Jersey. Cette disponibilité et l'accès aux liens de paiement devront être vérifiés directement dans l'application et auprès de Revolut. La documentation publique consultée ne décrit pas d'API Pro pour créer automatiquement les liens depuis Marée ; le parcours documenté est manuel depuis l'application.

Stripe n'est pas considéré comme une option pour une entreprise établie à Jersey selon sa liste de territoires pris en charge. Tout autre PSP (dont Adyen ou Checkout.com) reste une piste à réévaluer plus tard, après confirmation écrite de l'éligibilité et du produit marketplace.

Références à revalider au moment de reprendre le chantier :
- Revolut Business : https://www.revolut.com/business/
- Revolut Merchant : https://www.revolut.com/business/accept-payments/
- Stripe availability for outlying territories : https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries?locale=en-GB
- Digital Jersey — choosing a payment processor : https://www.digital.je/business-support/choosing-a-payment-processor-in-jersey/

## Frais existants — conservés pour le nouveau modèle

Le code applique un frais Marée par commande de 6,5 % du sous-total produits, facturé au restaurant, et gère séparément les frais de livraison. Ce taux est conservé avec l'abonnement de 19,99 £ ; les pêcheurs ne paient pas les frais de commande à Marée. Une ancienne simulation commerciale de commission totale à 13 % (partagée entre restaurant et pêcheur) est abandonnée pour le modèle décrit ici.

## Parcours de facturation cible

1. Le pêcheur envoie sa facture produit au restaurant par e-mail ; Marée n'encaisse ni ne reverse ce montant.
2. Marée conserve les lignes de commande et calcule les frais dus à partir des commandes convenues et réalisées.
3. Après acceptation explicite, Marée facture 19,99 £ par mois civil complet, sans prorata, et regroupe l'abonnement et les frais de commandes dans un relevé mensuel distinct, détaillé par période et commande. La résiliation prend effet à la fin du mois civil en cours.
4. L'indépendant crée dans Revolut Pro une facture ou un lien à montant fixe et l'envoie au restaurant ; cette étape reste manuelle tant que Pro n'offre pas d'API approuvée pour Jersey.
5. La facture Marée est marquée payée après vérification du règlement dans Revolut Pro, jamais sur la seule base d'une redirection navigateur.
6. Les règles de suspension ou de délai de grâce en cas d'impayé sont définies avant d'appliquer un blocage d'accès.

## Garde-fous

- Aucun revenu des ventes des pêcheurs ne transite par le compte Pro de Marée.
- Aucun paiement Revolut Pro n'est activé avant confirmation de son éligibilité à Jersey et vérification de l'activité par Revolut.
- Aucun secret de prestataire dans Git, le navigateur ou une variable VITE_.
- Une redirection navigateur ne constitue jamais une preuve de règlement ; la confirmation reste manuelle tant qu'aucune intégration Pro signée et approuvée n'existe.
- Les relevés indicatifs actuels ne sont ni des factures fiscales ni un registre de paiement.
- L'abonnement et les frais facturés doivent correspondre aux services propres de l'indépendant Marée et être validés pour la comptabilité et la GST.

## Réévaluation documentaire — 25 novembre 2026

Cette vérification porte uniquement sur les pages publiques des prestataires. Aucun compte marchand n'a été ouvert, aucun prestataire n'a été contacté et aucune intégration n'est activée.

| Prestataire | Ce que sa documentation publique indique | Conséquence pour Marée Jersey |
| --- | --- | --- |
| Stripe | Jersey ne figure pas parmi les territoires pris en charge pour l'établissement d'une entreprise. | À écarter pour une entité établie à Jersey, sauf confirmation écrite contraire de Stripe. L'acceptation éventuelle d'une carte émise à Jersey par un compte d'un autre territoire ne rend pas l'entreprise Jersey admissible. |
| Adfin | Sa page d'éligibilité mentionne les entreprises de Jersey. Son guide API décrit des demandes de paiement avec un facturier et un client. | Piste à étudier pour une facturation directe par chaque pêcheur. La documentation consultée ne confirme ni comptes connectés, ni partage automatique d'un paiement entre pêcheur et Marée, ni le modèle marketplace. |
| Mangopay | Les conditions publiques d'onboarding de plateforme demandent une société enregistrée dans l'EEE ou au Royaume-Uni. Jersey peut apparaître dans les règles applicables aux utilisateurs ou aux paiements, ce qui est distinct de l'éligibilité de la société plateforme. | Ne pas retenir pour une plateforme constituée uniquement à Jersey sans dérogation écrite et validation de l'entité par Mangopay. |
| Revolut Pro | Conçu pour les indépendants personnes physiques, pas pour les sociétés. Liens de paiement et factures disponibles dans l'application après validation du service. Les conditions de paiement limitent les encaissements aux ventes propres et interdisent de traiter des fonds pour un tiers. Jersey n'est pas cité sur la page Pro consultée. | Option à instruire pour l'abonnement Marée et les frais des commandes dus à Marée, si ce sont les prestations propres de l'indépendant. Ne pas y encaisser le prix des lots des pêcheurs. Confirmer l'accès à Pro et au service de paiement pour Jersey dans l'application / auprès de Revolut. |
| Revolut Business / Merchant | Jersey apparaît dans la liste d'éligibilité Business, sous conditions. La liste d'éligibilité Merchant ne cite pas Jersey. | Option pour une entité constituée, si Marée est une société ; non retenue pour le parcours indépendant demandé. Éligibilité Merchant Jersey et modèle marketplace toujours à confirmer. |

### Option d'architecture à instruire — sans activation

Le parcours à préparer est le suivant : les commandes livrées alimentent le relevé mensuel des frais Marée ; on y ajoute l'abonnement dû pour la période ; l'indépendant envoie une facture unique avec lien de paiement Revolut Pro au restaurant. Le restaurant et le pêcheur règlent séparément leur facture produit par e-mail, sans transit de fonds vendeur par Marée. Les factures Revolut Pro sont créées dans l'application ; la documentation consultée ne confirme pas que l'API Merchant ou les prélèvements récurrents soient disponibles pour un compte Pro à Jersey. À défaut de confirmation, les frais variables sont calculés par Marée et réglés sur une facture Pro manuelle au même échéancier mensuel.

Le code calcule les frais Marée par commande au taux par défaut conservé de 6,5 % et génère un relevé mensuel par restaurant à partir des commandes livrées. Le modèle retenu facture aux restaurants uniquement l'abonnement de 19,99 £ par mois civil complet et les frais de commande sur ce même relevé. Le tarif est enregistré au moment du consentement ; aucun montant d'abonnement n'est dû sans acceptation explicite. La génération du relevé et l'état de paiement sont gérés dans Marée, mais Revolut Pro n'a pas de lien de paiement intégré ni de confirmation automatique dans l'application.

Un encaissement unique des ventes pêcheurs suivi d'un partage automatique reste exclu de ce modèle. Les frais Marée sont ses revenus propres ; ils ne doivent pas être présentés comme le paiement des produits ni comme une preuve que le pêcheur a reçu son règlement.

Références officielles consultées :
- Revolut — qui peut utiliser Pro : https://help.revolut.com/help/more/revolut-pro/who-can-use-pro-and-how-to-get-started/
- Revolut — conditions Pro (personne physique indépendante, pas société) : https://www.revolut.com/legal/pro/
- Revolut — paiement Pro et interdiction d'agir pour un tiers : https://www.revolut.com/legal/business-acquiring/
- Revolut — accepter des paiements avec Pro : https://help.revolut.com/help/more/revolut-pro/accepting-customer-payments/accepting-payments-with-pro/
- Revolut — factures Pro : https://help.revolut.com/help/more/revolut-pro/accepting-customer-payments/question-revolut-pro-invoices/
- Revolut — marchés où Pro est disponible (page carte Pro) : https://help.revolut.com/help/more/revolut-pro/order-a-revolut-pro-card/
- Revolut Merchant — API de récurrence (à ne pas présumer disponible pour Revolut Pro) : https://developer.revolut.com/docs/guides/merchant/billing-subscriptions/api/introduction
- Revolut — pays éligibles à Business : https://help.revolut.com/business/help/setting-up-an-account/is-my-business-eligible/what-country-of-residence-is-eligible-to-open-a-revolut-business-account/
- Revolut — éligibilité Merchant : https://help.revolut.com/help/merchant-accounts/setting-up-a-merchant-account/who-can-apply-for-a-merchant-account/business/
- Revolut — conditions personnelles : https://www.revolut.com/legal/terms/
- Revolut Merchant API — décaissements et webhooks : https://developer.revolut.com/docs/api/merchant
- Revolut — Checkout hébergé, création serveur et confirmation par webhook : https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/api
- Revolut — cycle de paiement et webhooks : https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/using-webhooks
- Stripe — territoires pris en charge : https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries
- Adfin — entreprises éligibles : https://support.adfin.com/en/articles/10775157-which-businesses-can-use-adfin
- Adfin — guide des demandes de paiement : https://developer.adfin.com/products/partner-integration/guides/adfin-core/payment-request-guide
- Adfin — référence API paiement : https://developer.adfin.com/products/partner-integration/partner-integration-api-reference/payments
- Mangopay — critères d'accès plateforme : https://docs.mangopay.com/support
- Mangopay — restrictions pays utilisateur : https://docs.mangopay.com/guides/users/country-restrictions
- Revolut Merchant — démarrer : https://developer.revolut.com/docs/guides/merchant/get-started
