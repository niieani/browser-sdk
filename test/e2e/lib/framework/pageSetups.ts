import { LogsUserConfiguration } from '@datadog/browser-logs'
import { RumUserConfiguration } from '@datadog/browser-rum-core'

export interface SetupOptions {
  rum?: RumUserConfiguration
  rumRecorder?: RumUserConfiguration
  logs?: LogsUserConfiguration
  rumInit: (configuration: RumUserConfiguration) => void
  head?: string
  body?: string
}

export type SetupFactory = (options: SetupOptions) => string

const isBrowserStack =
  browser.config.services &&
  browser.config.services.some((service) => (Array.isArray(service) ? service[0] : service) === 'browserstack')

export const DEFAULT_SETUPS = isBrowserStack
  ? [{ name: 'bundle', factory: bundleSetup }]
  : [
      { name: 'async', factory: asyncSetup },
      { name: 'npm', factory: npmSetup },
      { name: 'bundle', factory: bundleSetup },
    ]

export function asyncSetup(options: SetupOptions) {
  let body = options.body || ''

  function formatSnippet(url: string, globalName: string) {
    return `(function(h,o,u,n,d) {
h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
d=o.createElement(u);d.async=1;d.src=n
n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','${url}','${globalName}')`
  }

  if (options.logs) {
    body += html`
      <script>
        ${formatSnippet('./datadog-logs.js', 'DD_LOGS')}
        DD_LOGS.onReady(function () {
          DD_LOGS.init(${formatLogsConfiguration(options.logs)})
        })
      </script>
    `
  }

  const rumConfiguration = options.rumRecorder || options.rum
  if (rumConfiguration) {
    body += html`
      <script type="text/javascript">
        ${formatSnippet(options.rumRecorder ? './datadog-rum-recorder.js' : './datadog-rum.js', 'DD_RUM')}
        DD_RUM.onReady(function () {
          ;(${options.rumInit.toString()})(${formatRumConfiguration(rumConfiguration)})
        })
      </script>
    `
  }

  return basePage({
    body,
    header: options.head,
  })
}

export function bundleSetup(options: SetupOptions) {
  let header = options.head || ''

  if (options.logs) {
    header += html`
      <script type="text/javascript" src="./datadog-logs.js"></script>
      <script type="text/javascript">
        DD_LOGS.init(${formatLogsConfiguration(options.logs)})
      </script>
    `
  }

  const rumConfiguration = options.rumRecorder || options.rum
  if (rumConfiguration) {
    header += html`
      <script
        type="text/javascript"
        src="${options.rumRecorder ? './datadog-rum-recorder.js' : './datadog-rum.js'}"
      ></script>
      <script type="text/javascript">
        ;(${options.rumInit.toString()})(${formatRumConfiguration(rumConfiguration)})
      </script>
    `
  }

  return basePage({
    header,
    body: options.body,
  })
}

export function npmSetup(options: SetupOptions) {
  let header = options.head || ''

  if (options.logs) {
    header += html`
      <script type="text/javascript">
        window.LOGS_CONFIG = ${formatLogsConfiguration(options.logs)}
      </script>
    `
  }

  const rumConfiguration = options.rumRecorder || options.rum
  if (rumConfiguration) {
    header += html`
      <script type="text/javascript">
        window.RUM_INIT = () => {
          ;(${options.rumInit.toString()})(${formatRumConfiguration(rumConfiguration)})
        }
      </script>
    `
  }

  header += html` <script type="text/javascript" src="./app.js"></script> `

  return basePage({
    header,
    body: options.body,
  })
}

export function basePage({ header, body }: { header?: string; body?: string }) {
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        ${header || ''}
      </head>
      <body>
        ${body || ''}
      </body>
    </html>
  `
}

// html is a simple template string tag to allow prettier to format various setups as HTML
export function html(parts: readonly string[], ...vars: string[]) {
  return parts.reduce((full, part, index) => full + vars[index - 1] + part)
}

function formatLogsConfiguration(configuration: LogsUserConfiguration) {
  return JSON.stringify(configuration)
}

function formatRumConfiguration(configuration: RumUserConfiguration) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  let result = JSON.stringify(configuration, (key, value) => (key === 'beforeSend' ? 'BEFORE_SEND' : value))
  result = result.replace('"LOCATION_ORIGIN"', 'location.origin')
  if (configuration.beforeSend) {
    result = result.replace('"BEFORE_SEND"', configuration.beforeSend.toString())
  }
  return result
}
