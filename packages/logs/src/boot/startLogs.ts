import {
  areCookiesAuthorized,
  Batch,
  combine,
  commonInit,
  Configuration,
  Context,
  createErrorFilter,
  ErrorObservable,
  HttpRequest,
  InternalMonitoring,
  limitModification,
  Observable,
  RawError,
  RelativeTime,
  startAutomaticErrorCollection,
  UserConfiguration,
} from '@datadog/browser-core'
import { Logger, LogsMessage, StatusType } from '../domain/logger'
import { LoggerSession, startLoggerSession } from '../domain/loggerSession'
import { LogsEvent } from '../logsEvent.types'
import { buildEnv } from './buildEnv'

export interface LogsUserConfiguration extends UserConfiguration {
  forwardErrorsToLogs?: boolean
  beforeSend?: (event: LogsEvent) => void | boolean
}

const FIELDS_WITH_SENSITIVE_DATA = ['view.url', 'view.referrer', 'message', 'error.stack', 'http.url']

export function startLogs(
  userConfiguration: LogsUserConfiguration,
  errorLogger: Logger,
  getGlobalContext: () => Context
) {
  const { configuration, internalMonitoring } = commonInit(userConfiguration, buildEnv)
  const errorObservable =
    userConfiguration.forwardErrorsToLogs !== false
      ? startAutomaticErrorCollection(configuration)
      : new Observable<RawError>()
  const session = startLoggerSession(configuration, areCookiesAuthorized(configuration.cookieOptions))
  return doStartLogs(configuration, errorObservable, internalMonitoring, session, errorLogger, getGlobalContext)
}

export function doStartLogs(
  configuration: Configuration,
  errorObservable: ErrorObservable,
  internalMonitoring: InternalMonitoring,
  session: LoggerSession,
  errorLogger: Logger,
  getGlobalContext: () => Context
) {
  internalMonitoring.setExternalContextProvider(() =>
    combine({ session_id: session.getId() }, getGlobalContext(), getRUMInternalContext())
  )

  const assemble = buildAssemble(session, configuration, reportError)
  const batch = startLoggerBatch(configuration)

  function reportError(error: RawError) {
    errorLogger.error(
      error.message,
      combine(
        {
          date: error.startClocks.timeStamp,
          error: {
            kind: error.type,
            origin: error.source,
            stack: error.stack,
          },
        },
        error.resource
          ? {
              http: {
                method: error.resource.method,
                status_code: error.resource.statusCode,
                url: error.resource.url,
              },
            }
          : undefined,
        getRUMInternalContext(error.startClocks.relative)
      )
    )
  }
  errorObservable.subscribe(reportError)

  return (message: LogsMessage, currentContext: Context) => {
    const contextualizedMessage = assemble(message, currentContext)
    if (contextualizedMessage) {
      batch.add(contextualizedMessage)
    }
  }
}

function startLoggerBatch(configuration: Configuration) {
  const primaryBatch = createLoggerBatch(configuration.logsEndpoint)

  let replicaBatch: Batch | undefined
  if (configuration.replica !== undefined) {
    replicaBatch = createLoggerBatch(configuration.replica.logsEndpoint)
  }

  function createLoggerBatch(endpointUrl: string) {
    return new Batch(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout
    )
  }

  return {
    add(message: Context) {
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(message)
      }
    },
  }
}

export function buildAssemble(
  session: LoggerSession,
  configuration: Configuration,
  reportError: (error: RawError) => void
) {
  const errorFilter = createErrorFilter(configuration, reportError)
  return (message: LogsMessage, currentContext: Context) => {
    if (!session.isTracked()) {
      return undefined
    }
    const contextualizedMessage = combine(
      { service: configuration.service, session_id: session.getId() },
      currentContext,
      getRUMInternalContext(),
      message
    )
    if (configuration.beforeSend) {
      const shouldSend = limitModification(
        contextualizedMessage as LogsEvent & Context,
        FIELDS_WITH_SENSITIVE_DATA,
        configuration.beforeSend
      )
      if (shouldSend === false) {
        return undefined
      }
    }
    if (contextualizedMessage.status === StatusType.error && errorFilter.isLimitReached()) {
      return undefined
    }
    return contextualizedMessage as Context
  }
}

interface Rum {
  getInternalContext: (startTime?: RelativeTime) => Context
}

function getRUMInternalContext(startTime?: RelativeTime): Context | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
}
