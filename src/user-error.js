// An error the user is shown. Its message is Finnish, the UI's source
// language, and its English is in public/translations.json: the pages mark it
// lang="fi" (public/i18n.js, errorContent) and translate-element puts the
// English in its place, like any other text. `status` is the HTTP status to
// answer with; `link` ({ text, href }) makes `text` in the message a link;
// `detail` is for the log only (e.g. what an upstream service answered).
export class UserError extends Error {
  constructor(message, { status = 400, link, detail } = {}) {
    super(message)
    this.status = status
    this.link = link
    this.detail = detail
  }
}

// The JSON body that carries a user error to the pages.
export function userErrorBody(err) {
  return { error: err.message, lang: 'fi', ...(err.link ? { link: err.link } : {}) }
}
