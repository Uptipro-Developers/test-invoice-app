import { useState } from "react";
import { motion as Motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  PenLine,
  ShieldCheck,
  Activity,
  Bell,
  MessagesSquare,
  FileText,
} from "lucide-react";
import CreateInvoiceAnimation from "../components/CreateInvoiceAnimation";
import styles from "./LandingPage.module.css";

const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};

const heroItem = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

// The copy column itself fades in first; its children then stagger in.
const heroCopyContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

function Reveal({ children, delay = 0, className }) {
  const reduceMotion = useReducedMotion();
  return (
    <Motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 32 }}
      whileInView={reduceMotion ? false : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Motion.div>
  );
}

export default function LandingPage({
  onGetStarted,
  onLogin,
  onNavigate,
}) {
  const [activeFaq, setActiveFaq] = useState(null);

  const handleGetStarted = () => {
    window.history.pushState({}, "", "/");
    onGetStarted();
  };

  const features = [
    {
      icon: FileText,
      title: "Create",
      description: "From a blank detail to a polished PDF in minutes, not days.",
      wide: true,
    },
    {
      icon: MessagesSquare,
      title: "Negotiate",
      description: "Counterterms, approvals and closes in one thread.",
    },
    {
      icon: Activity,
      title: "Track",
      description: "Every invoice and every status in one calm place.",
    },
    {
      icon: Bell,
      title: "Notify",
      description: "Deals move without you chasing follow-ups.",
    },
    {
      icon: PenLine,
      title: "Sign",
      description: "Signature and signer captured on the document.",
    },
    {
      icon: ShieldCheck,
      title: "Secure",
      description: "Consent-gated storage for every invoice payload.",
      full: true,
    },
  ];

  const faqs = [
    {
      question: "Is it really free?",
      answer: "Yes. The core create, negotiate and send flow is free forever. No credit card, no per-invoice fee.",
    },
    {
      question: "Do I need accounting knowledge?",
      answer: "Not at all. The builder guides you from raw details to a professional invoice without any accounting background.",
    },
    {
      question: "Can I customize the invoices?",
      answer: "Yes. Add your logo, notes, taxes and signature, and preview before sending. Every invoice can carry your own tone.",
    },
    {
      question: "How do negotiations work?",
      answer: "On the invoice itself. Counterterms, approval threads and closes stay in one conversation per deal.",
    },
    {
      question: "What formats can I export in?",
      answer: "PDF for sending and Excel for records, plus direct email delivery from the same preview.",
    },
    {
      question: "How is my data handled?",
      answer: "Invoice payloads are only stored after the privacy confirmation, and only with the details you entered.",
    },
  ];

  const stats = [
    { value: "2", suffix: "min", label: "average invoice build" },
    { value: "100", suffix: "%", label: "free forever" },
    { value: "0", suffix: "", label: "spreadsheets needed" },
  ];

  const heroCtas = (
    <Motion.div className={styles.heroCtas} variants={heroItem}>
      <button className={styles.btnPrimary} onClick={handleGetStarted}>
        Create Invoice <ArrowRight size={18} />
      </button>
      <button className={styles.btnGhost} onClick={onLogin}>
        Sign In / Sign Up
      </button>
    </Motion.div>
  );

  const heroCopy = (
    <Motion.div className={styles.heroCopy} variants={heroCopyContainer}>
      <Motion.p className={styles.heroEyebrow} variants={heroItem}>
        The calm way to invoice
      </Motion.p>
      <Motion.h1 className={styles.heroTitle} variants={heroItem}>
        <span className={styles.heroTitleLine}>Invoices that</span>
        <span className={`${styles.heroTitleLine} ${styles.heroTitleAccent}`}>
          get paid.
        </span>
      </Motion.h1>
      <Motion.p className={styles.heroSubtitle} variants={heroItem}>
        Create professional invoices in minutes, negotiate with clients in-app,
        and get paid. No spreadsheets, no awkward emails.
      </Motion.p>
      {heroCtas}
    </Motion.div>
  );

  const heroMedia = (
    <Motion.div className={styles.heroMedia} variants={heroItem}>
      <CreateInvoiceAnimation />
    </Motion.div>
  );

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <img src="/logo-full.png" alt="sabiquot" className={styles.logoImage} />
          </div>
          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>
              Features
            </a>
            <a href="#how-it-works" className={styles.navLink}>
              How It Works
            </a>
            <a href="#faqs" className={styles.navLink}>
              FAQs
            </a>
          </div>
          <div className={styles.navActions}>
            <button className={styles.btnGhost} onClick={onLogin}>
              Sign In / Sign Up
            </button>
            <button className={styles.btnPrimary} onClick={handleGetStarted}>
              Create Invoice
            </button>
          </div>
        </div>
      </nav>

      <section className={styles.hero}>
        <Motion.div
          className={styles.heroGrid}
          variants={heroContainer}
          initial="hidden"
          animate="show"
        >
          {heroCopy}
          {heroMedia}
        </Motion.div>
      </section>

      <section className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <span className={styles.statValue}>
              {stat.value}
              <span className={styles.statSuffix}>{stat.suffix}</span>
            </span>
            <span className={styles.statLabel}>{stat.label}</span>
          </div>
        ))}
      </section>

      <section id="features" className={styles.features}>
        <Reveal className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>One calm workspace for the whole deal</h2>
          <p className={styles.sectionSubtitle}>
            From first draft to paid, every step of your invoicing workflow lives
            in a single place.
          </p>
        </Reveal>
        <div className={styles.featuresGrid}>
          {features.map((feature, index) => (
            <Reveal
              key={feature.title}
              delay={index * 0.05}
              className={`${styles.featureCard} ${
                feature.wide ? styles.featureCardWide : ""
              } ${feature.full ? styles.featureCardFull : ""}`}
            >
              <div className={styles.featureIconWrap}>
                <feature.icon className={styles.featureIcon} />
              </div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how-it-works" className={`${styles.howItWorks} ${styles.sectionBand}`}>
        <Reveal className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>From first hello to paid in three moves</h2>
        </Reveal>
        <div className={styles.steps}>
          {[
            {
              no: "01",
              title: "Enter details",
              description: "Client, items and prices go in. The builder drafts the invoice.",
            },
            {
              no: "02",
              title: "Customize",
              description: "Add logo, notes, taxes and signature. Preview before sending.",
            },
            {
              no: "03",
              title: "Send",
              description: "Export, email or save. The deal keeps moving.",
            },
          ].map((step, index) => (
            <Reveal key={step.no} delay={index * 0.1} className={styles.stepWrap}>
              <div className={styles.step}>
                <span className={styles.stepNumber}>{step.no}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDescription}>{step.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="testimonials" className={styles.testimonials}>
        <Reveal className={styles.sectionHead}>
          <p className={styles.eyebrow}>Testimonials</p>
          <h2 className={styles.sectionTitle}>The whole quote to cash flow, calmly</h2>
        </Reveal>
        <Reveal className={styles.quoteWrap}>
          <blockquote className={styles.quote}>
            The whole quote to cash flow, from one calm screen.
          </blockquote>
          <p className={styles.quoteAttribution}>
            Daniel Okafor - Founder, Northwind Studio
          </p>
        </Reveal>
      </section>

      <section id="faqs" className={`${styles.faqs} ${styles.sectionBand}`}>
        <Reveal className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Questions, answered</h2>
        </Reveal>
        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <Reveal key={faq.question} delay={index * 0.04} className={styles.faqItem}>
              <button
                className={styles.faqQuestion}
                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                aria-expanded={activeFaq === index}
              >
                <span className={styles.faqText}>{faq.question}</span>
                {activeFaq === index ? (
                  <ChevronUp className={styles.faqIcon} size={20} />
                ) : (
                  <ChevronDown className={styles.faqIcon} size={20} />
                )}
              </button>
              {activeFaq === index && (
                <div className={styles.faqAnswer}>{faq.answer}</div>
              )}
            </Reveal>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <Reveal className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Your first invoice is minutes away.</h2>
          <p className={styles.ctaText}>
            Start from a blank page and have a professional invoice in your hands today.
          </p>
          <button className={styles.btnPrimary} onClick={handleGetStarted}>
            Create Invoice <ArrowRight size={18} />
          </button>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLegal}>
          {[
            { slug: "terms", label: "Terms & Conditions" },
            { slug: "privacy", label: "Privacy Policy" },
            { slug: "kyc", label: "KYC Policy" },
            { slug: "commission", label: "Commission Policy" },
          ].map((l) => (
            <button key={l.slug} className={styles.footerLink} onClick={() => onNavigate?.(l.slug)}>
              {l.label}
            </button>
          ))}
        </div>
        <p className={styles.footerCopy}>© 2026 sabiquot. Built for businesses everywhere.</p>
      </footer>
    </div>
  );
}
