// curriculumContextBritish.js — Cambridge Assessment International Education (CAIE) & Pearson Edexcel Curriculum Knowledge Base
// Years 7–11 | Lower Secondary Checkpoint (Y7–9) & Upper Secondary IGCSE (Y10–11)
// Subjects: Mathematics, Physics, Chemistry, Biology, Computer Science, English Language
// Contains syllabi, CAIE command words, marking taxonomy (M/A/B/FT), 2025 non-calculator rules, and Paper 6 ATP conventions.

const BRITISH_CURRICULUM = {

  // ══════════════════════════════════════════════════════════════
  // MATHEMATICS (Cambridge 0580 / 0862 & Edexcel 4MA1)
  // ══════════════════════════════════════════════════════════════
  Mathematics: {
    7: `CAMBRIDGE LOWER SECONDARY MATHEMATICS (Stage 7 / Year 7 — Syllabus 0862)
STRAND 1 — NUMBER: Integers & powers — prime factor decomposition, HCF and LCM via Venn diagrams, index notation for positive integers. Fractions, decimals & percentages — four operations on fractions and mixed numbers, terminating vs recurring decimals, fraction-decimal-percentage equivalences. Directed numbers — addition, subtraction, multiplication, division of negative integers. Ratio & proportion — dividing amounts into two or three parts in a given ratio, unitary method.
STRAND 2 — ALGEBRA: Collecting like terms, expanding single brackets a(bx + c), factorising by taking out common monomial factors. Constructing and solving linear equations with integer coefficients. Sequences — term-to-term and position-to-term rules, finding nth term for linear arithmetic sequences. Cartesian graphs — plotting y = mx + c.
STRAND 3 — GEOMETRY & MEASURE: Angles — parallel lines with transversals (alternate, corresponding, co-interior angles), vertically opposite angles, angle sum in triangles and quadrilaterals. 2D & 3D shapes — area and perimeter of composite rectangles/triangles, volume and surface area of cuboids. Coordinate geometry — reflection in axes and lines x = k, y = k, translations using vectors.
STRAND 4 — STATISTICS & PROBABILITY: Statistical inquiry cycle, frequency tables, bar charts, compound bar charts, pie charts. Measures of central tendency — mean, median, mode, range from raw data. Basic probability — scale 0 to 1, mutually exclusive outcomes, sample spaces.
THINKING & WORKING MATHEMATICALLY (TWM): Specialising (testing numerical examples) and Generalising (stating algebraic formulas). Conjecturing and Convincing.
KEY CAIE EXAMINER TRAPS: (1) Adding fractions by adding numerators and denominators (1/3 + 1/4 = 2/7). (2) Sign errors with negatives when expanding brackets: -3(2x - 5) written as -6x - 15 instead of -6x + 15. (3) Confusing perimeter (units) with area (units squared).`,

    8: `CAMBRIDGE LOWER SECONDARY MATHEMATICS (Stage 8 / Year 8 — Syllabus 0862)
STRAND 1 — NUMBER: Laws of indices for multiplication, division, and power of a power (a^m * a^n = a^(m+n), a^m / a^n = a^(m-n), (a^m)^n = a^mn). Standard form for large numbers (A * 10^n where 1 <= A < 10). Percentage multipliers for increase and decrease, reverse percentage problems in simple contexts. Rates of change — speed, distance, time, and mass, volume, density formulas.
STRAND 2 — ALGEBRA: Expanding double brackets (x + a)(x + b), factorising simple quadratic expressions x^2 + bx + c. Rearranging linear formulas to change the subject. Linear equations with unknowns on both sides (e.g. 5x - 3 = 2x + 9). Inequalities — solving linear inequalities and representing solutions on a number line. Real-life linear graphs — interpreting gradients as rates.
STRAND 3 — GEOMETRY & MEASURE: Polygons — interior and exterior angles of regular and irregular polygons (interior sum = (n-2)*180 deg; exterior sum = 360 deg). Circles — circumference C = 2*pi*r, area A = pi*r^2. Pythagoras' Theorem in 2D right-angled triangles (a^2 + b^2 = c^2). Surface area and volume of right prisms and cylinders. Three-figure bearings (measured clockwise from North).
STRAND 4 — STATISTICS & PROBABILITY: Grouped frequency distributions, estimating the mean using class midpoints. Scatter graphs — correlation (positive, negative, zero) and drawing lines of best fit. Probability — theoretical vs experimental, relative frequency, probability tree diagrams for two independent events.
KEY CAIE EXAMINER TRAPS: (1) Applying Pythagoras without ensuring the hypotenuse is opposite the right angle. (2) Reversing percentages by calculating the percentage of the final amount instead of setting up a multiplier (e.g. subtracting 20% from 120 instead of dividing by 1.2). (3) Forgetting three-figure bearings must always have 3 digits (e.g. 045 deg, not 45 deg).`,

    9: `CAMBRIDGE LOWER SECONDARY CHECKPOINT MATHEMATICS (Stage 9 / Year 9 — Syllabus 0862)
STRAND 1 — NUMBER: Negative and zero indices (a^-n = 1/a^n, a^0 = 1). Fractional indices (a^(1/2) = sqrt(a), a^(1/3) = cbrt(a)). Standard form for very small numbers (A * 10^-n). Rational and irrational numbers. Compound interest formula A = P(1 + r/100)^n. Upper and lower bounds for rounded measurements.
STRAND 2 — ALGEBRA: Factorising quadratic expressions (ax^2 + bx + c) and difference of two squares (x^2 - y^2). Simplifying algebraic fractions. Simultaneous linear equations — solving by elimination and substitution methods. Non-linear graphs — quadratic curves y = ax^2 + bx + c, turning points, reciprocal graphs y = k/x.
STRAND 3 — GEOMETRY & MEASURE: Congruence and similarity criteria for triangles. Pythagoras' Theorem in 3D cuboids. Introduction to trigonometry — Sine, Cosine, Tangent ratios in right-angled triangles (SOH CAH TOA). Transformations — enlargement with positive, fractional, and negative scale factors, finding center of enlargement.
STRAND 4 — STATISTICS & PROBABILITY: Cumulative frequency tables and cumulative frequency curves (Ogives). Estimating median, lower quartile (Q1), upper quartile (Q3), and Interquartile Range (IQR). Box-and-whisker plots. Combined probability of dependent events (sampling without replacement).
CHECKPOINT EXAM GRADING SCALE: 0.0 to 50.0 Rasch score bands (Outstanding 45–50, High 35–44, Good 25–34, Aspiring 15–24, Basic 0–14).
KEY CAIE EXAMINER TRAPS: (1) Tree diagrams without replacement: forgetting to decrease both numerator and denominator on second branches. (2) Miscalculating bounds in fractions: to find maximum A/B, one must compute UpperBound(A) / LowerBound(B). (3) Confusing quadratic factors with roots (roots are x = -p, -q when (x+p)(x+q) = 0).`,

    10: `CAMBRIDGE IGCSE MATHEMATICS (Year 10 — Syllabus 0580 Core & Extended / Edexcel 4MA1)
2025–2027 REBALANCED STRUCTURE: Paper 1 (Core) & Paper 2 (Extended) are strictly NON-CALCULATOR (50% weighting). Paper 3 (Core) & Paper 4 (Extended) are CALCULATOR ALLOWED (50% weighting).
STRAND 1 — NUMBER & SURDS (NON-CALCULATOR RIGOR): Surds — simplifying sqrt(ab) = sqrt(a)*sqrt(b), expanding surd expressions, rationalising denominators of the form a/sqrt(b) and a/(b +- sqrt(c)). Fractional and negative indices. Bounds — calculating error intervals and compound bounds. Exponential growth and decay models.
STRAND 2 — ALGEBRA & FUNCTIONS: Quadratic equations — completing the square a(x+p)^2 + q to find vertex/minimum point; quadratic formula x = (-b +- sqrt(b^2 - 4ac))/(2a). Simultaneous equations — one linear and one quadratic. Functions — notation f(x), composite functions fg(x) = f(g(x)), inverse functions f^-1(x). Inequalities — graphical shading of feasible regions.
STRAND 3 — COORDINATE GEOMETRY & GRAPHS: Parallel lines (m1 = m2) and perpendicular lines (m1 * m2 = -1). Equations of perpendicular bisectors. Tangents to curves — calculating gradient of a curve at a point. Area under speed-time graphs (distance travelled).
STRAND 4 — GEOMETRY & CIRCLE THEOREMS: Circle Theorems (7 theorems) — angle at center is twice angle at circumference; angle in a semicircle is 90 deg; angles in the same segment are equal; opposite angles of cyclic quadrilateral sum to 180 deg; alternate segment theorem; tangents from a point are equal; tangent is perpendicular to radius.
CAMBRIDGE MARKING TAXONOMY:
- M marks (Method): Awarded for valid mathematical working/substitution. Independent of arithmetic slips.
- A marks (Accuracy): Dependent on preceding M mark (M0 implies A0).
- B marks (Independent): Correct statement or value independent of method.
KEY CAIE EXAMINER TRAPS: (1) Exact trigonometric values: forgetting exact values for 30, 45, 60 degrees without a calculator. (2) Distributing negative signs: writing -(2x - 3) as -2x - 3. (3) Rounding premature intermediate values to 2 s.f. instead of keeping exact fractions or 4 s.f. until final step.`,

    11: `CAMBRIDGE IGCSE MATHEMATICS (Year 11 — Terminal Syllabus 0580 Extended & Edexcel 4MA1)
STRAND 1 — ADVANCED MENSURATION & 3D TRIGONOMETRY: Arc length (s = (theta/360)*2*pi*r) and sector area (A = (theta/360)*pi*r^2). Surface area and volume of spheres (V = 4/3*pi*r^3, A = 4*pi*r^2), cones (V = 1/3*pi*r^2*h, curved area = pi*r*l), and frustums. Sine Rule (a/sinA = b/sinB), Cosine Rule (a^2 = b^2 + c^2 - 2bc*cosA), Area of triangle = 1/2*a*b*sinC. 3D trigonometry and 3D Pythagoras in pyramids and prisms.
STRAND 2 — VECTORS & GEOMETRIC PROOF: Vector notation, magnitude |v| = sqrt(x^2 + y^2), column vectors, position vectors OA, OB. Collinear points and parallel vector proofs (showing vector AB = k * vector BC sharing common point B).
STRAND 3 — ADVANCED TRANSFORMATIONS: Matrices in Edexcel / Extended — combination of transformations (matrices). Single transformation rule: question stating "Describe fully the single transformation" receives ZERO marks if two transformations are given!
STRAND 4 — STATISTICS & PROBABILITY: Histograms with unequal class widths — Frequency Density = Frequency / Class Width. Area of bar represents frequency. Probability tree diagrams with conditional probability without replacement. Venn diagrams with set notation (xi, intersection, union, complement, empty set, subset).
ACCURACY CONVENTIONS: Non-exact answers must be given to 3 significant figures. Angles in degrees to 1 decimal place.
KEY CAIE EXAMINER TRAPS: (1) Histograms: plotting raw frequency on vertical axis instead of frequency density. (2) Sine rule ambiguous case: ignoring obtuse angle solution when sin(theta) > 0. (3) Two transformations given when question asks for a single transformation forfeits all marks.`
  },

  // ══════════════════════════════════════════════════════════════
  // PHYSICS (Cambridge 0625 & Edexcel 4PH1)
  // ══════════════════════════════════════════════════════════════
  Physics: {
    10: `CAMBRIDGE IGCSE PHYSICS (Year 10 — Syllabus 0625 & Edexcel 4PH1)
CORE CONSTANTS: Gravitational field strength g = 9.8 N/kg (or 9.8 m/s^2). Speed of light c = 3.0 * 10^8 m/s.
TOPIC 1 — MOTION, FORCES & ENERGY: Speed, velocity, acceleration (a = (v-u)/t). Speed-time graphs: gradient = acceleration; area under curve = distance travelled. Newton's laws of motion (F = ma). Terminal velocity and air resistance. Hooke's Law (F = k*x), limit of proportionality. Circular motion and centripetal force. Momentum (p = mv) and impulse (Impulse = F*delta_t = delta_p). Mechanical work (W = F*d), kinetic energy (Ek = 1/2*m*v^2), gravitational potential energy (Ep = m*g*h), power (P = W/t), efficiency = (useful output / total input) * 100%. Fluid pressure (p = rho*g*h).
TOPIC 2 — THERMAL PHYSICS: Kinetic particle model of matter. Brownian motion as evidence of molecular bombardment. Thermal expansion of solids, liquids, gases. Specific heat capacity (c = delta_E / (m * delta_theta)). Latent heat of fusion and vaporisation. Thermal transfer: Conduction (lattice vibrations & free electron diffusion in metals), Convection (density changes in fluids), Radiation (infrared; matte black = best absorber and emitter; shiny white = best reflector).
TOPIC 3 — WAVES & LIGHT: Wave properties: transverse vs longitudinal, v = f*lambda. Reflection: angle of incidence = angle of reflection. Refraction: Snell's Law n = sin(i)/sin(r) = c/v. Total Internal Reflection: critical angle sin(c) = 1/n; optical fibres. Thin converging lenses: principal focus, real vs virtual images, magnifying glass. Electromagnetic spectrum in order of increasing frequency. Sound: echoes, speed v = 2d/t, ultrasound.
KEY CAIE EXAMINER TRAPS: (1) Confusing mass (kg, scalar, constant) with weight (N, vector, dependent on g). (2) Forgetting that in speed-time graphs, area under the curve gives distance, NOT average speed. (3) Describing convection as "heat rises" — heat does NOT rise; hot fluid expands, becomes less dense, and is displaced upwards!`,

    11: `CAMBRIDGE IGCSE PHYSICS (Year 11 — Terminal Syllabus 0625 & Edexcel 4PH1)
TOPIC 4 — ELECTRICITY & MAGNETISM: Electric charge, current I = Q/t. Potential difference V = W/Q. Ohm's Law V = I*R. Resistors in series (R_total = R1 + R2) and parallel (1/R_total = 1/R1 + 1/R2). Electrical power P = I*V = I^2*R = V^2/R. Potential dividers: V_out = V_in * (R1 / (R1 + R2)). Transducers: LDR (light increases -> resistance decreases), Thermistor (temperature increases -> resistance decreases). Electromagnetic induction: Fleming's right-hand rule (generators) and left-hand rule (motors). Transformers: Vp/Vs = Np/Ns and Ip*Vp = Is*Vs (for 100% efficiency).
TOPIC 5 — NUCLEAR PHYSICS: Rutherford alpha-particle scattering experiment (dense, positively charged nucleus surrounded by mostly empty space). Alpha (He nucleus, strongly ionising, low penetration), Beta (fast electron, moderate ionising/penetration), Gamma (EM wave, weakly ionising, high penetration). Radioactive decay equations. Half-life calculations. Nuclear fission (splitting heavy nucleus by neutron absorption) vs nuclear fusion (joining light nuclei in stars).
TOPIC 6 — SPACE PHYSICS (MANDATORY MODULE): Orbital speed v = (2*pi*r)/T. Solar system: planets, elliptical comet orbits, gravitational attraction. Stellar evolution: Protostar -> Main sequence -> Red giant (Sun-like) -> Planetary nebula -> White dwarf; or Red supergiant -> Supernova -> Neutron star or Black hole. Redshift of distant galaxies: evidence for expanding universe. Hubble's Law v = H0 * d (H0 approx 2.2 * 10^-18 s^-1). Age of universe t approx 1/H0 approx 13.8 billion years.
PAPER 6 ALTERNATIVE TO PRACTICAL (ATP) GOLDEN RULES:
1. Tables: Quantity and unit separated by a slash (e.g. "Time / s", "Voltage / V").
2. Graph plotting: Scales must occupy > 50% of the grid. Points plotted as sharp crosses (x). Single, smooth line of best fit (never connect dot-to-dot).
3. 6-Mark Planning Question: Must state independent variable, dependent variable, 2 controlled variables, apparatus with ranges, method steps, safety precaution, and analysis/graph plan.
KEY CAIE EXAMINER TRAPS: (1) Stating radioactive decay is affected by temperature or pressure (it is purely spontaneous and random). (2) Drawing hairy or thick lines of best fit on Paper 6.`
  },

  // ══════════════════════════════════════════════════════════════
  // CHEMISTRY (Cambridge 0620 & Edexcel 4CH1)
  // ══════════════════════════════════════════════════════════════
  Chemistry: {
    10: `CAMBRIDGE IGCSE CHEMISTRY (Year 10 — Syllabus 0620 & Edexcel 4CH1)
TOPIC 1 — STATES OF MATTER & SEPARATION: Kinetic particle model. Diffusion: rate inversely proportional to relative molecular mass (Mr). Purity: sharp melting and boiling points indicate pure substances. Chromatography: Rf value = distance moved by substance / distance moved by solvent front. Separation methods: filtration, crystallisation, simple and fractional distillation.
TOPIC 2 — ATOMIC STRUCTURE & BONDING: Protons, neutrons, electrons. Isotopes (same proton number, different nucleon number, identical chemical properties due to same outer shell electrons). Ionic bonding: electrostatic attraction between oppositely charged ions (giant ionic lattices, high melting points, conduct electricity when molten or aqueous). Covalent bonding: shared pair of electrons (simple molecular vs giant covalent). Giant structures: Diamond (4 C-C bonds, tetrahedral, hard, insulator), Graphite (3 C-C bonds, hexagonal layers, weak intermolecular forces, delocalised electrons, conducts), Silicon(IV) oxide (SiO2). Metallic bonding: positive ions in a sea of delocalised electrons.
TOPIC 3 — STOICHIOMETRY & THE MOLE CONCEPT:
- Number of moles n = mass (g) / Mr.
- Gas volume at r.t.p.: V = n * 24 dm^3 (or 24,000 cm^3).
- Solution concentration: C = n / V (mol/dm^3).
- Empirical formula (simplest whole-number ratio of atoms) vs Molecular formula.
- Percentage yield = (actual mass / theoretical mass) * 100%.
- Limiting reactants: determining which reactant is consumed first using stoichiometric ratios.
TOPIC 4 — ELECTROCHEMISTRY: Electrolysis of molten lead(II) bromide PbBr2. Electrolysis of aqueous solutions: concentrated NaCl (brine: H2 gas at cathode, Cl2 gas at anode, NaOH remains). Rules for discharging at electrodes: cathode discharges least reactive (H+ unless Cu2+, Ag+ present); anode discharges halide ions if concentrated, otherwise OH- discharged to produce O2. Hydrogen-oxygen fuel cell: 2H2 + O2 -> 2H2O.
KEY CAIE EXAMINER TRAPS: (1) Confusing empirical formula with molecular formula. (2) Forgetting to convert cm^3 to dm^3 (divide by 1000) when calculating concentration. (3) Writing that ionic compounds conduct electricity because "electrons move" (in ionic compounds, IONS are free to move, not electrons!).`,

    11: `CAMBRIDGE IGCSE CHEMISTRY (Year 11 — Terminal Syllabus 0620 & Edexcel 4CH1)
TOPIC 5 — CHEMICAL ENERGETICS & KINETICS: Exothermic (delta_H negative, energy released, bond making) vs Endothermic (delta_H positive, energy absorbed, bond breaking). Bond energy calculation: delta_H = Sum(Bonds broken) - Sum(Bonds formed). Rates of reaction: Collision theory (activation energy Ea, frequency of successful collisions). Factors affecting rate: concentration, pressure, surface area, temperature, catalysts.
TOPIC 6 — EQUILIBRIA & INDUSTRIAL PROCESSES: Reversible reactions and dynamic equilibrium. Le Chatelier's Principle: effect of temperature, pressure, and concentration.
- Haber Process for Ammonia: N2 + 3H2 <=> 2NH3 (Conditions: 450 deg C, 200 atm, Iron catalyst).
- Contact Process for Sulfuric Acid: 2SO2 + O2 <=> 2SO3 (Conditions: 450 deg C, 2 atm, Vanadium(V) oxide V2O5 catalyst).
TOPIC 7 — ACIDS, BASES & SALTS: Proton transfer (acids = proton donors; bases = proton acceptors). Preparation of salts: excess insoluble base method, titration method (soluble salts), precipitation method (insoluble salts).
TOPIC 8 — ORGANIC CHEMISTRY: Fractional distillation of petroleum. Homologous series: general formula, functional group, physical trends.
- Alkanes: substitution reactions with halogens under UV light.
- Alkenes: catalytic cracking of long alkanes; addition reactions with bromine water (decolourises from orange to colourless), steam (making ethanol), and hydrogen.
- Alcohols: fermentation vs catalytic hydration of ethene.
- Carboxylic acids: oxidation of alcohols; esterification (alcohol + carboxylic acid <=> ester + water, acid catalyst).
- Polymers: addition polymerisation (poly(ethene)) vs condensation polymerisation (nylon [polyamide] and terylene [polyester]).
PAPER 6 EXPERIMENTAL TESTS: Identification of ions (flame tests, NaOH, aqueous ammonia), gases (H2, O2, CO2, Cl2, NH3).
KEY CAIE EXAMINER TRAPS: (1) In dynamic equilibrium, stating that concentrations of reactants and products are equal (they are CONSTANT, not necessarily equal!). (2) Describing cracking without mentioning high temperature and catalyst. (3) Confusing addition polymers with condensation polymers (condensation produces small molecule by-product like H2O).`
  },

  // ══════════════════════════════════════════════════════════════
  // BIOLOGY (Cambridge 0610 & Edexcel 4BI1)
  // ══════════════════════════════════════════════════════════════
  Biology: {
    10: `CAMBRIDGE IGCSE BIOLOGY (Year 10 — Syllabus 0610 & Edexcel 4BI1)
TOPIC 1 — ORGANISATION OF THE ORGANISM: Characteristics of living organisms (MRS GREN). Binomial nomenclature (Genus species). Cell structure: plant vs animal cells, bacterial cells. Magnification formula: M = I / A (Image size = Actual size * Magnification).
TOPIC 2 — MOVEMENT INTO AND OUT OF CELLS:
- Diffusion: net movement of particles from high concentration to low concentration down a concentration gradient.
- Osmosis: net movement of water molecules from a region of higher water potential to lower water potential through a partially permeable membrane. (NEVER say "concentration of water").
- Active transport: movement of particles against a concentration gradient using energy from respiration and carrier proteins.
TOPIC 3 — BIOLOGICAL MOLECULES & ENZYMES: Food tests: Benedict's test for reducing sugars (brick-red precipitate), Iodine test for starch (blue-black), Biuret test for proteins (purple/violet), Ethanol emulsion test for lipids (milky-white emulsion), DCPIP for Vitamin C. Enzymes: biological catalysts, lock-and-key hypothesis, active site, denaturation at high temperatures due to shape change of active site (NEVER say enzymes "die" or are "killed").
TOPIC 4 — PLANT NUTRITION & TRANSPORT: Photosynthesis equation: 6CO2 + 6H2O -> C6H12O6 + 6O2 (chlorophyll, light energy). Leaf structure and adaptations (palisade mesophyll, spongy mesophyll, stomata, guard cells). Xylem: transports water and mineral ions unidirectionally by transpiration pull. Phloem: translocates sucrose and amino acids bidirectionally from source to sink.
TOPIC 5 — HUMAN NUTRITION & DIGESTION: Balanced diet, mechanical digestion (teeth), chemical digestion (amylase, protease/pepsin/trypsin, lipase). Bile: neutralises gastric acid and emulsifies fats into small droplets to increase surface area for lipase. Absorption in ileum: villi and microvilli adaptations, lacteals.
KEY CAIE EXAMINER TRAPS: (1) Stating enzymes "die" at high temperatures (enzymes are molecules, not living; they DENATURE). (2) Defining osmosis without specifying "partially permeable membrane" and "water potential". (3) Confusing ingestion, digestion, absorption, assimilation, and egestion.`
  },

  // ══════════════════════════════════════════════════════════════
  // COMPUTER SCIENCE (Cambridge 0478 & Edexcel 4CP0)
  // ══════════════════════════════════════════════════════════════
  'Computer Science': {
    10: `CAMBRIDGE IGCSE COMPUTER SCIENCE (Year 10 & 11 — Syllabus 0478 & Edexcel 4CP0)
SECTION 1 — COMPUTER SYSTEMS:
- Data Representation: Binary, denary, hexadecimal conversions. Binary addition, overflow flag. Logical binary shifts. Two's complement for negative integers (-128 to +127). Text (ASCII, Unicode), images (pixels, colour depth, resolution), sound (sample rate, bit depth). Data compression: lossy vs lossless.
- Data Transmission: Packets, packet structure (header, payload, trailer). Serial vs parallel, simplex, half-duplex, full-duplex. Error checking: parity bits, checksum, check digits, ARQ (Automatic Repeat reQuest). Encryption: symmetric vs asymmetric.
- Hardware & Von Neumann Architecture: CPU components: ALU, CU, System Clock, Registers (PC, MAR, MDR, CIR, ACC). System buses: Address bus (unidirectional), Data bus (bidirectional), Control bus (bidirectional). Fetch-Decode-Execute (FDE) cycle. Primary memory (RAM, ROM, cache). Secondary storage: Magnetic, Optical, Solid State (flash memory).
- Automated Control Loop (Strict 6-Step CAIE Protocol):
  1. Sensor measures physical analogue data.
  2. ADC converts analogue measurement to digital signal.
  3. Digital data transmitted to microprocessor.
  4. Microprocessor compares value against pre-stored threshold values.
  5. If value is outside threshold, microprocessor sends digital control signal.
  6. Actuator operates physical device (motor, valve, heater).
SECTION 2 — ALGORITHMS, PROGRAMMING & LOGIC:
- Logic Gates: NOT, AND, OR, NAND, NOR, XOR truth tables (up to 3 inputs / 8 rows).
- Standard Algorithms: Linear search, bubble sort, totalling, counting, finding maximum, minimum, average.
- Trace Tables: Values must only be written on the row where they change.
- 15-Mark Unseen Scenario Problem: Declare variables -> Initialise totals/counters -> Input validation loop -> Core loop processing -> Formatted output.
KEY CAIE EXAMINER TRAPS: (1) Confusing MAR (holds memory address) with MDR (holds data read from or written to memory). (2) Writing unchanged values across trace table rows (scores zero). (3) Confusing microprocessor with actuator in control systems.`
  },

  // ══════════════════════════════════════════════════════════════
  // ENGLISH (Cambridge First Language 0500 & Edexcel 4EA1)
  // ══════════════════════════════════════════════════════════════
  English: {
    10: `CAMBRIDGE IGCSE FIRST LANGUAGE ENGLISH (Year 10 & 11 — Syllabus 0500 & Edexcel 4EA1)
PAPER 1 — READING:
- Q1 Comprehension & Summary Task (Q1f):
  * Strict word count: 100 to 115 words (maximum 120 words). Exceeding 120 words incurs severe penalties. Writing > 140 words caps writing at Band 2.
  * Continuous prose only: no bullet points, no personal opinions, no verbatim lifting of phrases from text.
  * Must extract exactly 10 distinct content points from texts and synthesize in own words.
- Q2 Writer's Effects (Language Analysis):
  * Select 3 specific words/phrases per paragraph from the specified extract.
  * Analyze literal meaning -> emotional connotations -> overall intended atmospheric effect on the reader.
  * NEVER use empty feature spotting ("the writer uses a metaphor to make us imagine"). Explain PRECISELY how the imagery works.
- Q3 Extended Response to Reading:
  * Adopt persona (letter, journal entry, newspaper article, speech).
  * Address all three bullet points equally. Bullet 3 requires speculative evaluation, implicit inference, and character justification.
PAPER 2 — DIRECTED WRITING & COMPOSITION:
- Section A Directed Writing:
  * Synthesize, evaluate, and critically challenge arguments from two contrasting discursive texts.
  * Tone must match specified form (formal letter, speech, article).
- Section B Composition:
  * Descriptive writing: frozen camera pan, atmospheric sensory details (sight, sound, texture, smell), zoom-in micro details. Avoid narrative plot slips.
  * Narrative writing: Freytag's dramatic pyramid (exposition, inciting incident, rising tension, climax, falling action, resolution). Realistic dialogue punctuation.
KEY CAIE EXAMINER TRAPS: (1) Exceeding 120 words in summary task. (2) Verbatim lifting of chunks of text. (3) The "narrative slip" in descriptive writing when plot action replaces sensory atmosphere.`
  }
};

// ── CAIE OFFICIAL COMMAND WORDS PEDAGOGICAL CONTRACT ─────────
const CAIE_COMMAND_WORDS = {
  State: 'Prompt for a concise, 1-phrase factual recall. Do not ask for explanations.',
  Describe: 'Prompt for what happens in chronological sequence or visual trends on a graph. Do not accept why/mechanisms.',
  Explain: 'STRICT: Reject descriptive answers. Force the student to state causal mechanisms, why/how, kinetic particle collisions, or biological reasons.',
  Calculate: 'Insist on 3 steps: (1) State formula, (2) Substitute numerical values with units, (3) Round non-exact values to 3 significant figures.',
  Determine: 'Require exact mathematical deduction or geometric proof; do not allow visual guessing.',
  Suggest: 'Guide the student to apply a known syllabus principle to an unfamiliar, novel context.',
  Deduce: 'Guide the student to draw conclusions directly from given data, graphs, or trends.',
  'Show that': 'The final answer is given in the question. Guide the student step-by-step through every intermediate method mark (M marks) without skipping lines.'
};

module.exports = {
  BRITISH_CURRICULUM,
  CAIE_COMMAND_WORDS,
  CAIE: {
    Mathematics_0580: {
      paperRules: {
        Paper1: { calculatorAllowed: false, tier: 'core' },
        Paper2: { calculatorAllowed: false, tier: 'extended' },
        Paper3: { calculatorAllowed: true, tier: 'core' },
        Paper4: { calculatorAllowed: true, tier: 'extended' }
      }
    },
    CommandWords: CAIE_COMMAND_WORDS,
    Sciences_ATP_Paper6: {
      variableIdentification: {
        independent: 'Variable altered systematically across at least 5 values',
        dependent: 'Measured response with exact instrument and metric units',
        control: 'Parameters kept constant to ensure valid comparison'
      }
    }
  },
  EDEXCEL: {
    Mathematics_4MA1: {
      calculatorsAllowedThroughout: true,
      higherTopics: ['Calculus Differentiation', 'Advanced Vectors']
    }
  }
};
