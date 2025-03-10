import { RumEvent } from '../../../rum/src'
import { BuildEnv, BuildMode } from '../boot/init'
import { display } from '../tools/display'
import { buildConfiguration } from './configuration'
import { Datacenter } from './transportConfiguration'

describe('configuration', () => {
  const clientToken = 'some_client_token'
  const usEnv: BuildEnv = {
    buildMode: BuildMode.RELEASE,
    datacenter: Datacenter.US,
    sdkVersion: 'some_version',
  }

  describe('cookie options', () => {
    it('should not be secure nor crossSite by default', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: false, crossSite: false })
    })

    it('should be secure when `useSecureSessionCookie` is truthy', () => {
      const configuration = buildConfiguration({ clientToken, useSecureSessionCookie: true }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: true, crossSite: false })
    })

    it('should be secure and crossSite when `useCrossSiteSessionCookie` is truthy', () => {
      const configuration = buildConfiguration({ clientToken, useCrossSiteSessionCookie: true }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: true, crossSite: true })
    })

    it('should have domain when `trackSessionAcrossSubdomains` is truthy', () => {
      const configuration = buildConfiguration({ clientToken, trackSessionAcrossSubdomains: true }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: false, crossSite: false, domain: jasmine.any(String) })
    })
  })

  describe('beforeSend', () => {
    it('should be undefined when beforeSend is missing on user configuration', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.beforeSend).toBeUndefined()
    })

    it('should return the same result as the original', () => {
      const beforeSend = (event: RumEvent) => {
        if (event.view.url === '/foo') {
          return false
        }
      }
      const configuration = buildConfiguration({ clientToken, beforeSend }, usEnv)
      expect(configuration.beforeSend!({ view: { url: '/foo' } }, {})).toBeFalse()
      expect(configuration.beforeSend!({ view: { url: '/bar' } }, {})).toBeUndefined()
    })

    it('should catch errors and log them', () => {
      const myError = 'Ooops!'
      const beforeSend = () => {
        throw myError
      }
      const configuration = buildConfiguration({ clientToken, beforeSend }, usEnv)
      const displaySpy = spyOn(display, 'error')
      expect(configuration.beforeSend!(null, {})).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledWith('beforeSend threw an error:', myError)
    })
  })
})
