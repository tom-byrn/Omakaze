"use client";

/** Rewrites the form action with the organization login before submitting. */
export function OrgSubmit() {
  return (
    <button
      type="submit"
      className="btn btn-secondary btn-md"
      onClick={(e) => {
        const form = e.currentTarget.form;
        const org = (form?.elements.namedItem("org") as HTMLInputElement | null)?.value.trim();
        if (!form || !org) {
          e.preventDefault();
          return;
        }
        form.action = form.action.replace("__ORG__", encodeURIComponent(org));
      }}
    >
      Create for organization
    </button>
  );
}
