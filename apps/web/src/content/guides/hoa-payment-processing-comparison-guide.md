---
title: "HOA Payment Processing Comparison Guide"
description: >-
  Comparing HOA payment processors — ACH vs card, fee structures, owner-pays vs HOA-pays models, state restrictions on convenience fees, and settlement timing.
tags: [guide]
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
buyerStage: mofu
targetPersona:
  - board-treasurer
  - board-president
primaryKeyword: HOA payment processing comparison
searchIntent: informational
bluf: >-
  Several states restrict charging owners convenience fees for paying HOA assessments by card. Boards that pass through processor fees in those states are violating state collection-fee statutes — and most do not realize it.
faqs:
  - q: Can HOAs charge convenience fees for card payments?
    a: >-
      Some states restrict it, others allow it with disclosure. The rule depends on the state's collection-fee statute and the HOA's bylaws.
  - q: Is ACH cheaper than card for HOAs?
    a: >-
      Yes. ACH is typically a flat fee per transaction; card is a percentage of the amount. For monthly assessments, ACH is almost always cheaper.
  - q: How long does payment settlement take?
    a: >-
      ACH settles in two to five business days; card settles in one to three business days, depending on the processor.
definitions:
  - term: Convenience fee
    definition: >-
      A fee charged to a payer for using a particular payment method, typically card. Some states restrict HOAs from charging convenience fees on assessment payments.
  - term: Surcharge
    definition: >-
      A fee added to a card transaction to recover the merchant's processing cost. Surcharges are governed by both card-network rules and state law, and are restricted or prohibited in certain states.
answers:
  - question: How should HOAs handle payment processing fees?
    answer: >-
      Boards should evaluate state law before passing fees to owners. In states that restrict convenience fees on HOA assessments, the board must absorb the processor cost. In states that allow disclosed fees, the board can elect to pass the fee. Either model works financially as long as the board chooses deliberately and discloses the choice.
  - question: What is the difference between ACH and card processing for HOAs?
    answer: >-
      ACH pulls funds directly from the owner's bank account at a flat per-transaction fee, typically one to two dollars. Card processing charges a percentage of the transaction amount, usually two to three percent. For an HOA collecting two-hundred-dollar monthly assessments, ACH costs about a dollar; card costs four to six dollars.
  - question: How fast does payment settlement happen?
    answer: >-
      ACH typically settles in two to five business days from initiation. Card settlement is faster, often one to three business days, but card has higher chargeback risk that can reverse the settlement up to sixty days later. Boards planning cash flow should assume ACH for the most predictable timing.
relatedPages:
  - /resources/guides/hoa-collection-policy-template/
  - /resources/guides/hoa-budget-guide/
  - /resources/guides/hoa-bills-explained/
  - /resources/guides/hoa-board-liability-guide/
  - /resources/best/best-hoa-accounting-software/
steps:
  - title: Check your state's restrictions on convenience fees
    content: >-
      Pull the state HOA statute and the consumer-protection statutes that govern collection fees. Several states restrict or prohibit charging owners a fee for paying an HOA assessment by card. Even where state law is silent, bylaws sometimes prohibit fee pass-throughs. Document the rule that applies to your association before configuring the processor. If counsel is available, get a written opinion — fee restrictions are easy to violate accidentally.
  - title: Compare processor fee structures across the shortlist
    content: >-
      Get written fee schedules from each processor under consideration. Compare ACH per-transaction fees, card percentages and per-transaction fees, monthly minimums, statement fees, and any one-time setup costs. Watch for hidden fees — some processors add a regulatory pass-through that is not disclosed in the basic schedule. The best comparison is total monthly cost at your community's expected mix of ACH and card.
  - title: Test settlement timing with small transactions
    content: >-
      Before going live, run small test transactions through each candidate processor and time the settlement. Document when funds appeared in the operating account. Settlement timing affects cash flow, and some processors hold funds longer than they advertise. The test also validates that the processor's reporting integrates correctly with the accounting system, which is where most operational pain shows up after launch.
reviewedAt: "2026-04-29"
sources:
  - title: "Federal Trade Commission — Truth in Billing for Payment Surcharges"
    source: Federal Trade Commission
    url: "https://www.ftc.gov/business-guidance/credit-finance"
    lastChecked: "2026-04-29"
---

## Why payment processing is more legally complex than it looks

Most HOA boards treat payment processing as a commodity. Pick a processor, plug it into the accounting system, send owners a link. The reality is that payment processing for HOA assessments is governed by an overlapping set of rules:

- **State HOA statutes** that restrict what fees the association can charge owners for collecting assessments.
- **State consumer-protection statutes** that govern surcharges and convenience fees more broadly.
- **Card-network rules** (Visa, Mastercard, American Express) that constrain when and how surcharges can be applied.
- **Federal banking regulations** (Reg E for ACH, Reg Z for card) that establish disclosure requirements.
- **The HOA's own bylaws and collection policy** that may further restrict fee pass-throughs.

Boards that configure payment processing without checking these layers often find themselves on the wrong side of a state statute. Pass-through convenience fees on card payments are the most common violation, because processors default to a configuration that just adds the fee to the owner's bill, and few boards realize state law restricts the practice.

## ACH vs card

For HOA assessments, ACH is almost always the right primary payment method.

**ACH advantages:**

- Lower per-transaction cost (typically one to two dollars flat).
- Predictable settlement timing (two to five business days).
- Lower chargeback risk — ACH disputes follow Reg E rules with a sixty-day window, but disputes are rare for recurring authorized transactions.
- Easier to enable as automatic recurring payment.

**ACH disadvantages:**

- Slower settlement than card.
- Setup requires the owner to provide bank account information, which some owners hesitate to do.
- Reversal possibility if the owner's bank account has insufficient funds.

**Card advantages:**

- Owner familiarity — most people are comfortable typing a card number.
- Faster settlement (one to three business days).
- Reward-card incentives motivate some owners to use card.

**Card disadvantages:**

- Higher cost (two to three percent of transaction amount).
- Chargeback risk extends sixty days, with fees per dispute.
- Some states restrict pass-through of card fees to owners.

A typical HOA payment configuration accepts both, with ACH as the default and card as an option. The board absorbs the ACH fee (it is small) and decides per state whether to pass through the card fee.

## The convenience fee question

The phrase "convenience fee" appears in state statutes and card-network rules and means slightly different things in each. For HOAs, the practical question is: when an owner pays by card, who pays the processor's percentage?

Three models:

1. **HOA absorbs.** The processor takes its percentage from the gross payment, and the HOA receives the remainder. The owner pays the assessment amount as billed.
2. **Owner pays disclosed convenience fee.** The processor adds a stated fee on top of the assessment. The owner pays assessment plus fee.
3. **Owner pays surcharge.** Similar to convenience fee but governed by card-network surcharge rules, with specific disclosure requirements.

Several states restrict or prohibit options 2 and 3 for HOA assessments specifically. The reasoning is that assessments are a mandatory fee owners must pay to remain in good standing, and the legislature has decided owners cannot be charged extra for the act of paying.

States that have explicitly restricted convenience fees on HOA assessments include several with active HOA legislation. The list changes — boards should check their state's current statute and any recent attorney general opinions before configuring fee pass-through. When in doubt, absorb the fee.

## Processor selection criteria

Beyond fees and state-law compliance, evaluate processors on:

### Integration with accounting

The processor's transaction output should flow into the accounting system as posted transactions, with the owner identified, the assessment period applied, and the fee booked appropriately. Manual reconciliation between processor and accounting is a sign the integration is weak.

### Reporting

Pull a sample report from each processor. The report should show transaction-level detail, settlement-batch detail, and chargeback activity. Reports that omit any of these create reconciliation pain.

### Chargeback handling

When an owner disputes a card charge, the processor manages the response. Ask how disputes are surfaced to the board, what evidence the processor expects, and what the chargeback fee schedule looks like. Boards that have never been through a chargeback are surprised by how quickly the fees add up.

### PCI compliance

Confirm the processor handles PCI compliance for the board. The board should never directly handle card numbers — the processor or its hosted form should be the only entity that sees the card data. This protects the board from PCI obligations entirely.

### Recurring payment support

Most owners want to set up assessments as recurring auto-pay. The processor must support recurring schedules, recurring authorization, and clean off-ramps when an owner sells the unit or wants to stop the recurring schedule.

## Settlement timing and cash flow

Settlement timing affects when cash is available to pay vendors and contribute to reserves. ACH typically settles in two to five business days; card in one to three. Some processors hold funds longer than the stated window, especially for new accounts or high-volume periods.

Boards planning monthly cash flow should:

- Map the assessment due date, the average payment date, the expected settlement date, and the vendor payment dates.
- Confirm the operating account balance covers vendor obligations even if settlement is delayed by a few days.
- Avoid same-day vendor payments funded by same-day assessment receipts — the timing is too tight.

## Fee handling in the accounting system

Whichever fee model the board chooses, the accounting system must record fees correctly. If the HOA absorbs the fee, the fee is an operating expense. If the owner pays a disclosed convenience fee, the fee is a pass-through with no impact on association revenue. If the owner pays a surcharge governed by card-network rules, treatment depends on the surcharge structure.

Misclassifying fees is a common audit finding. The processor's monthly statement should reconcile to the fee account in the ledger. Any unexplained variance needs investigation.

## How to evaluate during a trial

During a trial, run real transactions through the processor and validate end-to-end:

1. Owner pays assessment.
2. Funds settle to the operating account.
3. Transaction posts to the accounting system with correct fund, owner, period.
4. Fee posts to the correct fee account.
5. Reconciliation reports balance.

If any step fails, the integration is incomplete. Fix it before going live, not after.

## The bottom line

Payment processing looks commoditized but is not. The legal layer matters. The integration layer matters. The cash-flow layer matters. Boards that pick the cheapest processor without checking state law sometimes save twenty dollars a month while exposing themselves to class-action liability. Boards that check the law, choose deliberately, and integrate cleanly save volunteer time and stay out of compliance trouble.
