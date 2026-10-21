import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Cliente HTTP interno construido sobre Axios, con interceptores listos.
 *
 * Deja preparado el camino para que los servicios (por ejemplo el motor de
 * IA/OCR) consulten APIs externas (Gemini, OpenAI, OpenCV) sin ensuciar la
 * lógica de negocio ni repetir configuración en cada módulo.
 */
@Injectable()
export class HttpClient {
  private readonly logger = new Logger(HttpClient.name);
  private readonly instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.registerRequestInterceptors();
    this.registerResponseInterceptors();
  }

  get<TResponse>(url: string, config?: Parameters<AxiosInstance['get']>[1]) {
    return this.instance.get<TResponse>(url, config);
  }

  post<TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: Parameters<AxiosInstance['post']>[2],
  ) {
    return this.instance.post<TResponse>(url, body, config);
  }

  put<TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: Parameters<AxiosInstance['put']>[2],
  ) {
    return this.instance.put<TResponse>(url, body, config);
  }

  delete<TResponse>(
    url: string,
    config?: Parameters<AxiosInstance['delete']>[1],
  ) {
    return this.instance.delete<TResponse>(url, config);
  }

  private registerRequestInterceptors() {
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        this.logger.debug(
          `HTTP ${config.method?.toUpperCase() ?? 'REQUEST'} ${config.url ?? ''}`,
        );
        return config;
      },
      (error: AxiosError) => Promise.reject(error),
    );
  }

  private registerResponseInterceptors() {
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        this.logger.debug(
          `HTTP ${response.status} ${response.config.method?.toUpperCase() ?? ''} ${response.config.url ?? ''}`,
        );
        return response;
      },
      (error: AxiosError) => {
        this.logger.error(
          `HTTP error ${error.response?.status ?? 'sin respuesta'} en ${error.config?.url ?? 'desconocido'}: ${error.message}`,
        );
        return Promise.reject(
          new ServiceUnavailableException(
            'El servicio externo no está disponible en este momento',
          ),
        );
      },
    );
  }
}
