/**
 * @note This API is extended by both "msw/node" and "msw/native"
 * so be minding about the things you import!
 */
import type { RequiredDeep } from 'type-fest'
import { invariant } from 'outvariant'
import {
  BatchInterceptor,
  InterceptorReadyState,
  type HttpRequestEventMap,
  type Interceptor,
} from '@mswjs/interceptors'
import type { LifeCycleEventsMap, SharedOptions } from '~/core/sharedOptions'
import { SetupApi } from '~/core/SetupApi'
import { handleRequest } from '~/core/utils/handleRequest'
import type { RequestHandler } from '~/core/handlers/RequestHandler'
import { HttpHandler } from '~/core/handlers/HttpHandler'
import { GraphQLHandler } from '~/core/handlers/GraphQLHandler'
import type { WebSocketHandler } from '~/core/handlers/WebSocketHandler'
import { mergeRight } from '~/core/utils/internal/mergeRight'
import { InternalError, devUtils } from '~/core/utils/internal/devUtils'
import type { SetupServerCommon } from './glossary'
import { handleWebSocketEvent } from '~/core/ws/handleWebSocketEvent'
import { webSocketInterceptor } from '~/core/ws/webSocketInterceptor'

export const DEFAULT_LISTEN_OPTIONS: RequiredDeep<SharedOptions> = {
  onUnhandledRequest: 'warn',
}

export class SetupServerCommonApi
  extends SetupApi<LifeCycleEventsMap>
  implements SetupServerCommon
{
  protected readonly interceptor: BatchInterceptor<
    Array<Interceptor<HttpRequestEventMap>>,
    HttpRequestEventMap
  >
  private resolvedOptions: RequiredDeep<SharedOptions>

  constructor(
    interceptors: Array<{ new (): Interceptor<HttpRequestEventMap> }>,
    handlers: Array<RequestHandler | WebSocketHandler>,
  ) {
    super(...handlers)

    this.interceptor = new BatchInterceptor({
      name: 'setup-server',
      interceptors: interceptors.map((Interceptor) => new Interceptor()),
    })

    this.resolvedOptions = {} as RequiredDeep<SharedOptions>

    this.init()
  }

  /**
   * Subscribe to all requests that are using the interceptor object
   */
  private init(): void {
    this.interceptor.on(
      'request',
      async ({ request, requestId, controller }) => {
        const response = await handleRequest(
          request,
          requestId,
          this.handlersController.currentHandlers().filter((handler) => {
            return (
              handler instanceof HttpHandler ||
              handler instanceof GraphQLHandler
            )
          }),
          this.resolvedOptions,
          this.emitter,
        )

        if (response) {
          controller.respondWith(response)
        }

        return
      },
    )

    this.interceptor.on('unhandledException', ({ error }) => {
      if (error instanceof InternalError) {
        throw error
      }
    })

    this.interceptor.on(
      'response',
      ({ response, isMockedResponse, request, requestId }) => {
        this.emitter.emit(
          isMockedResponse ? 'response:mocked' : 'response:bypass',
          {
            response,
            request,
            requestId,
          },
        )
      },
    )

    // Preconfigure the WebSocket interception but don't enable it just yet.
    // It will be enabled when the server starts.
    handleWebSocketEvent({
      getUnhandledRequestStrategy: () => {
        return this.resolvedOptions.onUnhandledRequest
      },
      getHandlers: () => {
        return this.handlersController.currentHandlers()
      },
      onMockedConnection: () => {},
      onPassthroughConnection: () => {},
    })
  }

  public listen(options: Partial<SharedOptions> = {}): void {
    this.resolvedOptions = mergeRight(
      DEFAULT_LISTEN_OPTIONS,
      options,
    ) as RequiredDeep<SharedOptions>

    // Apply the interceptor when starting the server.
    this.interceptor.apply()
    this.subscriptions.push(() => this.interceptor.dispose())

    // Apply the WebSocket interception.
    webSocketInterceptor.apply()
    this.subscriptions.push(() => webSocketInterceptor.dispose())

    // Assert that the interceptor has been applied successfully.
    // Also guards us from forgetting to call "interceptor.apply()"
    // as a part of the "listen" method.
    invariant(
      [InterceptorReadyState.APPLYING, InterceptorReadyState.APPLIED].includes(
        this.interceptor.readyState,
      ),
      devUtils.formatMessage(
        'Failed to start "setupServer": the interceptor failed to apply. This is likely an issue with the library and you should report it at "%s".',
      ),
      'https://github.com/mswjs/msw/issues/new/choose',
    )
  }

  public close(): void {
    this.dispose()
  }
}
