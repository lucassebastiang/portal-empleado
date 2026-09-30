-- Auditoría de solo escritura, garantizada por la base de datos.
--
-- Revocar UPDATE y DELETE depende de con qué rol conecte cada proceso. Un
-- trigger se ejecuta para TODOS los roles, así que la garantía no depende de
-- cómo esté configurada cada conexión.
--
-- La única excepción es la limpieza de registros antiguos, y tiene que
-- anunciarse de forma explícita dentro de su propia transacción: no puede
-- ocurrir por accidente ni desde una consulta suelta de la aplicación.
--
-- Reescrito de forma genérica a partir del proyecto real.

CREATE OR REPLACE FUNCTION auditoria_solo_append() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.purga_auditoria', true), '') = 'si' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La auditoría es de solo escritura: no se puede hacer % sobre ella', TG_OP;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditoria_append_only ON auditoria;

CREATE TRIGGER auditoria_append_only
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_solo_append();


-- La limpieza de registros antiguos la lanza un administrador desde el panel,
-- con una fecha de corte, y es un acto deliberado en su propia transacción.
-- Las filas del chat NO se limpian nunca: ahí está la prueba de quién aceptó
-- la política de uso del chat y cuándo (deber de información del RGPD).
-- Y la propia limpieza queda registrada después en la auditoría.
BEGIN;
  SET LOCAL app.purga_auditoria = 'si';
  DELETE FROM auditoria
   WHERE creada < $1          -- fecha de corte elegida por el administrador
     AND accion NOT LIKE 'chat.%';
COMMIT;
