import type { Element, ElementContent, Root, Text } from "hast";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { escapeCurrencyDollars } from "@/lib/markdown/dollars";
import { highlightToHtml } from "@/lib/diff/highlight";
import { CodeCopy } from "./CodeCopy";
import { CodeRefLink } from "./CodeRefLink";
import { Mermaid } from "./Mermaid";

const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "video", "source", "details", "summary", "kbd", "figure", "figcaption", "picture", "mark"],
  attributes: {
    ...defaultSchema.attributes,
    video: ["src", "poster", "controls", "autoPlay", "loop", "muted", "playsInline", "width", "height", "preload"],
    source: ["src", "type", "media", "srcSet"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "loading", "align", "title"],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./, "math-inline", "math-display"]],
    pre: [...(defaultSchema.attributes?.pre ?? []), ["className", "math", "math-display"]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", "math", "math-display"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "math", "math-inline"]],
    details: ["open"],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "diff"],
  },
};

const ALERTS: Record<string, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

function isElement(n: unknown, tag?: string): n is Element {
  return typeof n === "object" && n !== null && (n as Element).type === "element" && (!tag || (n as Element).tagName === tag);
}

/** Turn GitHub-style `> [!NOTE]` blockquotes into alert blocks. */
function rehypeAlerts() {
  return (tree: Root) => {
    const walk = (node: Root | Element) => {
      for (const child of node.children) {
        if (!isElement(child)) continue;
        if (child.tagName === "blockquote") {
          const p = child.children.find((c) => isElement(c, "p")) as Element | undefined;
          const first = p?.children[0] as Text | undefined;
          const m = first?.type === "text" ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(first.value) : null;
          if (p && first && m) {
            const kind = m[1].toUpperCase();
            first.value = first.value.slice(m[0].length);
            if (p.children[1] && isElement(p.children[1], "br")) p.children.splice(1, 1);
            child.properties = { ...child.properties, className: ["md-alert", `md-alert-${kind.toLowerCase()}`] };
            const title: Element = {
              type: "element",
              tagName: "p",
              properties: { className: ["md-alert-title"] },
              children: [{ type: "text", value: ALERTS[kind] }],
            };
            child.children.unshift(title as ElementContent);
          }
        }
        walk(child);
      }
    };
    walk(tree);
  };
}

function textOf(node: ElementContent | Element | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map((c) => textOf(c)).join("");
  return "";
}

async function CodeBlock({ code, lang }: { code: string; lang: string | null }) {
  const html = await highlightToHtml(code.replace(/\n$/, ""), lang);
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang ?? "text"}</span>
        <CodeCopy text={code} />
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const components: Components = {
  pre({ node, children }) {
    const codeEl = node?.children.find((c) => isElement(c, "code")) as Element | undefined;
    if (!codeEl) return <pre>{children}</pre>;
    const cls = (codeEl.properties?.className as string[] | undefined) ?? [];
    if (cls.includes("math-display")) return <pre>{children}</pre>;
    const lang = cls.find((c) => c.startsWith("language-"))?.slice("language-".length) ?? null;
    const code = textOf(codeEl);
    if (lang === "mermaid") return <Mermaid chart={code} />;
    return <CodeBlock code={code} lang={lang} />;
  },
  a({ href, children, ...rest }) {
    void rest;
    if (href?.startsWith("diff:")) return <CodeRefLink href={href}>{children}</CodeRefLink>;
    if (href && VIDEO_RE.test(href) && typeof children === "string" && children === href) {
      return <video src={href} controls preload="metadata" className="md-video" />;
    }
    const external = href ? /^https?:\/\//.test(href) : false;
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
        {children}
      </a>
    );
  },
  img({ src, alt, title, width, height }) {
    const url = typeof src === "string" ? src : undefined;
    if (url && VIDEO_RE.test(url)) {
      return <video src={url} controls preload="metadata" className="md-video" title={alt ?? title ?? undefined} />;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt ?? ""} title={title ?? undefined} width={width} height={height} loading="lazy" />;
  },
  video({ node, ...props }) {
    void node;
    return <video {...props} controls preload="metadata" className="md-video" />;
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

/** GitHub-flavored markdown with mermaid, math, alerts, video and diff links. Server component. */
export function Markdown({ source, className = "guide-prose" }: { source: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeAlerts, rehypeKatex]}
        components={components}
        urlTransform={(url) => url}
      >
        {escapeCurrencyDollars(source)}
      </ReactMarkdown>
    </div>
  );
}
