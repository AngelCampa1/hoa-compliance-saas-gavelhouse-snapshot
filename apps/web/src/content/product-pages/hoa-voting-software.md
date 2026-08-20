---
title: HOA Voting Software for Elections and Ballots
description: >-
  HOA director elections carry real legal exposure. California requires secret
  ballots and an inspector of elections.
publishedAt: "2026-04-24"
updatedAt: "2026-04-24"
reviewedAt: "2026-04-24"
buyerStage: bofu
ctaMode: convert
schema: SoftwareApplication
primaryKeyword: hoa voting software
searchIntent: commercial
tags:
  - hoa-voting
  - elections
  - proxy-voting
targetPersona:
  - board-president
  - board-secretary
bluf: >-
  HOA director elections carry real legal exposure. California requires secret
  ballots and an inspector of elections; most other states have quorum and
  notice requirements that boards routinely miss. Running elections through
  email threads and paper ballots leaves no audit trail and creates the kind of
  procedural gaps that end in homeowner lawsuits.
productCategory: Voting and Elections
targetRoles:
  - President
  - Secretary
  - Inspector of Elections
keyFeatures:
  - >-
    Secret ballot support for director elections with ballot separation so voter
    identity is never linked to the ballot itself.
  - >-
    Quorum tracking and proxy management that counts returned ballots and
    proxies against the required threshold in real time.
  - >-
    Electronic and in-person voting with a timestamped audit trail that survives
    any post-election challenge.
  - >-
    Inspector of elections workflow that assigns an independent inspector,
    tracks the ballot envelope process, and certifies results to the official
    meeting record.
faqs:
  - q: Does HOA voting software need to support secret ballots?
    a: >-
      In California, yes. Civil Code Section 5100 requires secret ballots for
      director elections and certain membership votes, with a double-envelope
      system to separate voter identity from the ballot itself. Most other
      states recommend secret ballots as a best practice even when not legally
      required, because commingling voter identity with ballot choices exposes
      results to challenge. Proper HOA voting software should enforce the
      double-envelope model so the board cannot inadvertently violate the
      requirement.
  - q: What quorum is required for HOA elections?
    a: >-
      Quorum requirements vary by state and governing documents, but most HOA
      bylaws set election quorum at 20 to 30 percent of the total membership.
      California Civil Code Section 5115 permits ballots returned by mail or
      electronic delivery to count toward quorum, which is why proxy and
      absentee management is central to any election workflow. Boards that
      cannot document quorum cannot certify results, which exposes any action
      taken at that meeting to invalidation.
  - q: Does California require an inspector of elections for HOA votes?
    a: >-
      Yes. California Civil Code Section 5110 requires HOAs to appoint an
      inspector of elections who is independent of the board and its candidates.
      The inspector receives and counts ballots, determines quorum, and
      certifies results. Other states increasingly recommend the role even where
      not mandated, because an independent certifier removes the appearance of
      self-dealing when the board is counting its own election results.
answers:
  - q: What is the risk of running HOA elections through email and spreadsheets?
    a: >-
      No audit trail, no documented quorum calculation, no separation of voter
      identity from ballot choices, and no independent certification of results.
      Any homeowner who challenges the election has a straightforward argument
      that procedures were not followed, which can void the results and require
      a re-run under court supervision.
  - q: Can electronic voting satisfy HOA secret ballot requirements?
    a: >-
      Yes, if the system enforces ballot separation. The legal requirement is
      not paper ballots; it is that the board cannot link a specific homeowner
      to a specific ballot choice. Electronic systems that log votes to voter
      accounts fail this test. Systems that generate an anonymized ballot token
      and store the voter identity separately satisfy it. Gavelhouse uses the
      latter model.
tableData:
  name: HOA Voting Workflow
  columns:
    - Election Task
    - Manual Process
    - With Gavelhouse
  rows:
    - - Quorum tracking
      - Count returned ballots by hand; recalculate if proxies arrive late
      - Running count updates automatically as ballots and proxies are recorded
    - - Secret ballot compliance
      - Paper envelopes; risk of premature opening or identity exposure
      - >-
        Double-envelope model enforced at the system level; voter and ballot
        stored separately
    - - Proxy management
      - Proxies tracked on a separate sheet; easy to miscount or lose
      - >-
        Proxies recorded and counted toward quorum in the same workflow as
        ballots
    - - Inspector of elections
      - Assign by email; no formal workflow; inspector works from paper
      - >-
        Inspector assigned inside the system; receives ballots, certifies count,
        result feeds into meeting record
    - - Audit trail
      - No timestamped record; results live in an email thread
      - >-
        Every ballot submission, proxy, and count step is timestamped and stored
        against the election record
sources:
  - title: California Civil Code Section 5100 (Elections)
    source: California Legislature
    url: >-
      https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=5100
    lastChecked: "2026-04-24"
  - title: California Civil Code Section 5110 (Inspector of Elections)
    source: California Legislature
    url: >-
      https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=5110
    lastChecked: "2026-04-24"
  - title: Gavelhouse pricing
    source: Gavelhouse
    url: "https://gavelhouse.app/pricing.txt"
    lastChecked: "2026-04-24"
relatedPages:
  - /resources/guides/hoa-board-election-procedures/
  - /resources/guides/hoa-proxy-voting-guide/
  - /product/hoa-governance-workflow-software/
statistics: []
---

## Elections are the highest-risk governance event a volunteer board runs

Most board operations carry low legal exposure. Elections do not. The combination of fiduciary authority, member rights, and state-specific procedural requirements means that a botched election can produce homeowner lawsuits, court-ordered re-runs, and personal liability for board members who signed off on flawed results.

We built the election workflow in Gavelhouse because we could not find a system that enforced secret ballot separation at the data layer, tracked quorum in real time, and gave the inspector of elections a governed workflow instead of a pile of paper envelopes.

## The three procedural failures that invalidate HOA elections

### 1. Quorum not documented

A meeting that does not reach quorum cannot conduct binding business, including electing directors. Most boards know the quorum threshold is in their bylaws but track it with a head count and a spreadsheet. When proxies arrive late, when someone forgets to count absentee ballots, or when the count is disputed afterward, there is no reliable record.

California specifically allows mailed and electronically delivered ballots to count toward quorum under Civil Code Section 5115, which means the quorum calculation runs in parallel with ballot collection rather than at the meeting itself. That requires a real-time running count, not a day-of tally.

### 2. Secret ballot requirement violated

California's Civil Code Section 5100 requires secret ballots for director elections and specified membership votes. The legal model is a double-envelope system: the outer envelope identifies the voter, the inner envelope holds the ballot, and the two are separated before counting so that no one can link a vote to a voter. Other states do not always mandate this by statute, but most HOA attorneys recommend the practice because commingled records are trivially easy to challenge.

Email-based voting, Google Form elections, and any system that logs votes to voter accounts all fail this test. The secret ballot requirement is not about paper; it is about data separation.

### 3. No inspector of elections, or an inspector without a workflow

California Civil Code Section 5110 mandates an inspector of elections independent of the board and candidates. The inspector receives ballots, counts them, determines whether quorum was achieved, and certifies the results. Most communities either skip the role entirely or appoint someone who works from a paper printout with no formal chain of custody.

When results are challenged, and in contentious elections they usually are, the inspector needs to show a documented record: when each ballot was received, whether it was valid, how the count was conducted, and when results were certified. Paper does not provide that record.

## What the Gavelhouse election workflow covers

Gavelhouse handles elections as a governed workflow with four interlocking pieces:

**Ballot issuance and voter identity.** The system records which homeowner received a ballot. The ballot itself is stored without the voter link. Proxies are recorded in the same workflow and count toward quorum automatically.

**Running quorum count.** As ballots are returned and proxies are recorded, the quorum meter updates. Boards know before the meeting whether they have sufficient participation to proceed. Late arrivals are added in real time rather than recounted from scratch.

**Inspector of elections assignment.** The inspector is assigned inside Gavelhouse and receives a dedicated view for ballot collection and counting. The count is timestamped. Results are recorded against the election record and flow directly into the meeting minutes.

**Audit trail.** Every step, including ballot issued, proxy received, envelope opened, count conducted, and results certified, carries a timestamp and is attached to the election record. If a homeowner challenges the result, the board can produce a complete procedural record, not an email thread.

## Who this is for

This workflow is built for volunteer boards that run annual director elections and periodic membership votes. The president typically owns election logistics. The secretary manages the meeting record that receives certified results. The inspector of elections, whether a homeowner volunteer or a contracted professional, works directly in the system rather than alongside it.

Multi-community operators running elections across several associations will find the inspector assignment and audit trail features particularly useful for demonstrating consistent procedure across communities.

Election results should not live apart from the rest of the board record. Certified outcomes should feed the official meeting history in [HOA board meeting software](/product/hoa-board-meeting-software/) and the broader continuity layer in [HOA governance workflow software](/product/hoa-governance-workflow-software/). That is how a new secretary can confirm who was elected, when results were certified, and which board actions followed.

Boards that publish election notices or owner instructions should also coordinate the workflow with [HOA owner portal software](/product/hoa-owner-portal-software/). Owner-facing access does not replace the inspector process, but it can reduce confusion about deadlines, eligibility, and where members should look for election information.
