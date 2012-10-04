goog.provide('yuma.okfn.ImagePlugin');

goog.require('goog.soy');
goog.require('goog.dom');
goog.require('goog.dom.query');
goog.require('goog.events');
goog.require('goog.math');
goog.require('goog.style');

/**
 * Implementation of the Yuma image plugin for OKFN Annotator.
 * @param {element} image the image to be annotated
 * @param {Object} okfnAnnotator reference to the OKFN Annotator instance
 * @constructor
 */
yuma.okfn.ImagePlugin = function(image, annotatableElement, okfnAnnotator) {
  var staticOffset = yuma.modules.getOffset(annotatableElement); 
  
  var eventBroker = new yuma.events.EventBroker(this);
  
  var annotationLayer = goog.dom.createDom('div', 'yuma-annotationlayer');
  goog.style.setStyle(annotationLayer, 'position', 'relative');
  goog.style.setSize(annotationLayer, image.width, image.height); 
  goog.dom.replaceNode(annotationLayer, image);
  goog.dom.appendChild(annotationLayer, image);
    
  var hint = goog.soy.renderAsElement(yuma.templates.image.hint, {msg:'Click and Drag to Annotate'});
  goog.style.setOpacity(hint, 0); 
  goog.dom.appendChild(annotationLayer, hint);
  
  var viewCanvas = goog.soy.renderAsElement(yuma.templates.image.canvas,
    { width:image.width, height:image.height });
  goog.dom.appendChild(annotationLayer, viewCanvas);   

  /** @private **/
  var editCanvas = goog.soy.renderAsElement(yuma.templates.image.canvas, 
    { width:image.width, height:image.height });
  goog.style.showElement(editCanvas, false); 
  goog.dom.appendChild(annotationLayer, editCanvas);  
 
  // TODO correctly fire
  //  yuma.events.EventType.MOUSE_OVER_ANNOTATABLE_MEDIA,
  //  yuma.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_MEDIA,
  
  goog.events.listen(annotationLayer, goog.events.EventType.MOUSEOVER, function() { 
    goog.style.setOpacity(viewCanvas, 1.0); 
    goog.style.setOpacity(hint, 0.8); 
  });
  
  goog.events.listen(annotationLayer, goog.events.EventType.MOUSEOUT, function() { 
    goog.style.setOpacity(viewCanvas, 0.4); 
    goog.style.setOpacity(hint, 0);
  });
 
  /** @private **/
  var viewer = new yuma.modules.image.Viewer(viewCanvas, new yuma.okfn.Popup(image, eventBroker, okfnAnnotator, staticOffset), eventBroker);
  
  /** @private **/
  var selector = new yuma.selection.DragSelector(editCanvas, eventBroker);

  var self = this;
  goog.events.listen(viewCanvas, goog.events.EventType.MOUSEDOWN, function(event) {
    goog.style.showElement(editCanvas, true);
    selector.startSelection(event.offsetX, event.offsetY);
  });
  
  /** Communication yuma -> okfn **/
  
  eventBroker.addHandler(yuma.events.EventType.SELECTION_COMPLETED, function(event) {	
    // TODO once we have aligned our datamodels, this conversion won't be necessary any more
    var annotation = { url: image.src, shape: event.shape };
    okfnAnnotator.publish('beforeAnnotationCreated', annotation);
	
    var geometry = event.shape.geometry;
    var offset = yuma.modules.getOffset(image);    
    var x = geometry.x + offset.left + 16;
    var y = geometry.y + geometry.height + offset.top + 5;
    
    okfnAnnotator.showEditor(annotation, {top: window.pageYOffset - staticOffset.top, left: 0});
    goog.style.setPosition(okfnAnnotator.editor.element[0], x - staticOffset.left, y + window.pageYOffset - staticOffset.top);	
  });
  
  /** Communication okfn -> yuma **/
  
  okfnAnnotator.viewer.on('edit', function(annotation) {
    // Problem: We have N yuma.okfn.ImagePlugin instances for N images, hence this
    // event handler is called N times & we need to check against the image SRC.
    // TODO find a better solution
    if (annotation.url == image.src) {
      // TODO code duplication -> move into a function
      var shape = annotation.shape;
      var offset = yuma.modules.getOffset(image);
      var x = shape.geometry.x + offset.left + 16;
      var y = shape.geometry.y + shape.geometry.height + offset.top + 5;

      // Use editor.show instead of showEditor to prevent a second annotationEditorShown event
      goog.style.setPosition(okfnAnnotator.editor.element[0], 0, window.pageYOffset - staticOffset.top);
      okfnAnnotator.editor.show();
      goog.style.setPosition(okfnAnnotator.editor.element[0], x - staticOffset.left, y + window.pageYOffset - staticOffset.top);
    }
  });

  okfnAnnotator.viewer.on('hide', function() {
    eventBroker.fireEvent(yuma.events.EventType.POPUP_HIDDEN);
  });
  
  okfnAnnotator.subscribe('annotationCreated', function(annotation) {
    selector.stopSelection();
    if(annotation.url == image.src) {
      viewer.addAnnotation(annotation);
    }
  });
  
  okfnAnnotator.subscribe('annotationsLoaded', function(annotations) {
    // Use Google's forEach utility instead!
    for(var i in annotations) {
      var annotation = annotations[i];
      if(annotation.url == image.src) {
	viewer.addAnnotation(annotation);
      }
    }
  });
  
  okfnAnnotator.subscribe('annotationDeleted', function(annotation) {
    if(annotation.url == image.src) {
      viewer.removeAnnotation(annotation);
    }
  });
  
  okfnAnnotator.subscribe('annotationEditorHidden', function(editor) {
    goog.style.showElement(editCanvas, false);
    selector.stopSelection();
  });
}

/**
 * A wrapper around the OKFN 'viewer', which corresponds to Yuma's Popup.
 * @constructor
 */
yuma.okfn.Popup = function(image, eventBroker, okfnAnnotator, staticOffset) {
  /** @private **/
  this._image = image;
  
  /** @private **/
  this._eventBroker = eventBroker;
  
  /** @private **/ 
  this._okfnAnnotator = okfnAnnotator;
  
  /** @private **/
  // TODO is the anntotableElement accessible via okfnAnnotator?
  this._staticOffset = staticOffset;
}

yuma.okfn.Popup.prototype.startHideTimer = function() {
  this._okfnAnnotator.startViewerHideTimer();
}

yuma.okfn.Popup.prototype.clearHideTimer = function() {
  this._okfnAnnotator.clearViewerHideTimer();
}

yuma.okfn.Popup.prototype.show = function(annotation, x, y) {
  var offset = yuma.modules.getOffset(this._image);
  this._okfnAnnotator.showViewer([annotation], {top: window.pageYOffset - this._staticOffset.top , left: 0});   
  goog.style.setPosition(this._okfnAnnotator.viewer.element[0],
			 offset.left + 16 + x - this._staticOffset.left,
			 offset.top + y + window.pageYOffset - this._staticOffset.top);
  this._okfnAnnotator.clearViewerHideTimer();
}

yuma.okfn.Popup.prototype.setPosition = function(x, y) {
  goog.style.setPosition(this._okfnAnnotator.viewer.element[0], x, y);  
}

/**
 * OKFN plugin interface.
 */
window['Annotator']['Plugin']['YumaImagePlugin'] = (function() {
  var annotatableElement;

  function YumaImagePlugin(element, options) {
    annotatableElement = element;
  }

  YumaImagePlugin.prototype['pluginInit'] = function() {
    var images = annotatableElement.getElementsByTagName('img');
    
    var self = this;
    yuma.modules.addOnLoadHandler(function() {
      // TODO use Google collection iterator util
      for (var i=0; i<images.length; i++) {
        new yuma.okfn.ImagePlugin(images[i], annotatableElement, self['annotator']);
        // TODO annotation edit save event => annotator
      }
    });
  }
  
  return YumaImagePlugin;
})();

