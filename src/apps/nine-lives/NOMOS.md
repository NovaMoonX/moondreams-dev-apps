# Nine Lives and Nomos

**In one line:** ask Nomos when a cat's next vaccine is due or which vet saw them last, and bring the cats, the clinics and the vets into your circle.

## What Nomos can read

| Category | Kind | At connect | Why |
|---|---|---|---|
| Your cats | pet | On | Names, birth date, breed, food. |
| Vet clinics | place | On | Phone, address, doctors, 24-hour emergency care. |
| Veterinarians | person | Off | Each vet's name and clinic; turn on to bring vets into your circle. |
| Vet visits, Vaccines and preventives due | event, task | On | What is coming up and what is due. |
| Health conditions, Symptoms | knowledge | Off | Sensitive; only when asked for. |
| Visit notes, Doses given, Weights, Cat spending | live | Off | Read only when asked. |

## Bringing them into the circle

The cats become pets, each clinic a business (with its phone), each vet a person ("Vet at Paws"). Nomos checks the circle first: a name that matches is merged and keeps both records' facts, a close one is asked ("Is this Dr. Patel?"). See `.claude/rules/helm.md` "Bring in what an app holds".

## Not shared

Uploaded records, expense notes and receipts, microchip and insurance details, litter logs.

## Keeping it current

A new stored record of a person, pet or business in this app is a category (kind `person`, `pet` or `place`) and an entry in Helm's `BRING_IN_SOURCES`.
