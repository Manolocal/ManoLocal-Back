export interface CopomexCpInfoItem {
  error: boolean;
  code_error: number;
  error_message: string | null;
  response: {
    cp: string;
    asentamiento?: string;
    tipo_asentamiento?: string;
    municipio: string;
    estado?: string;
    ciudad?: string;
    pais?: string;
  } | null;
}

export type CopomexInfoCpResponse = CopomexCpInfoItem[] | CopomexCpInfoItem;

export interface CopomexCpByMunicipioResponse {
  error: boolean;
  code_error: number;
  error_message: string | null;
  response: {
    cp: string[];
  } | null;
}
