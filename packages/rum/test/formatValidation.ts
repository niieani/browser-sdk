import { Context } from '@datadog/browser-core'
import ajv from 'ajv'
import rumEventsFormatJson from '../../../rum-events-format/rum-events-format.json'
import _commonSchemaJson from '../../../rum-events-format/schemas/_common-schema.json'
import actionSchemaJson from '../../../rum-events-format/schemas/action-schema.json'
import errorSchemaJson from '../../../rum-events-format/schemas/error-schema.json'
import long_taskSchemaJson from '../../../rum-events-format/schemas/long_task-schema.json'
import resourceSchemaJson from '../../../rum-events-format/schemas/resource-schema.json'
import viewSchemaJson from '../../../rum-events-format/schemas/view-schema.json'

export function validateFormat(rumEvent: Context) {
  const instance = new ajv({
    allErrors: true,
  })
  const valid = instance
    .addSchema(_commonSchemaJson, 'schemas/_common-schema.json')
    .addSchema(viewSchemaJson, 'schemas/view-schema.json')
    .addSchema(actionSchemaJson, 'schemas/action-schema.json')
    .addSchema(resourceSchemaJson, 'schemas/resource-schema.json')
    .addSchema(long_taskSchemaJson, 'schemas/long_task-schema.json')
    .addSchema(errorSchemaJson, 'schemas/error-schema.json')
    .addSchema(rumEventsFormatJson, 'rum-events-format.json')
    .validate('schemas/_common-schema.json', rumEvent)

  expect(valid).toBe(true, 'invalid rum event')
  if (instance.errors) {
    instance.errors.map((error) => expect(error.message).toBeUndefined())
  }
}
