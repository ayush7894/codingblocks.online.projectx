import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { or, alias } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class ApplicationController extends Controller {
  @service router
  @service session
  @service layout
  @computed ('router.currentRouteName')
  get isInsideAttemptRoute () {
    return ['attempt'].includes(this.get('router.currentRouteName').split('.')[0])
  }
  @computed ('router.currentRouteName')
  get isInsidePlayer () {
    return ['player'].includes(this.get('router.currentRouteName').split('.')[0])
  }

  @or('isInsidePlayer', 'isInsideAttemptRoute') hideNav
  @alias('isInsideAttemptRoute') hideFooter

  @action
  setOutsideContainer(el) {
    this.layout.setOutsideContainer(el)
  }
}