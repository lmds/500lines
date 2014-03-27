var jsdiff = require('diff');
var dateformat = require('dateformat');
var marked = require('marked');

module.exports = function (app, store) {

  this.checkAuthenticated = function(request, response, next){
      if(!request.isAuthenticated()) response.redirect('/unauthorized/');
      next();
  };

  this.formatDate = function(date){
    return date ? dateformat(date, "h:MMTT d-mmm-yyyy") : '';
  };

  this.formatHtmlString = function(content, callback){
    try{
      return callback(null, marked(content, {sanitize: true}));
    }catch(e){
      return callback(e, null);
    }
  };

  this.formatHtmlDoc = function(doc, callback){
    if(!doc) doc = {};
    if(!doc.content) doc.content = '';
    this.formatHtmlString(doc.content, function(error, formattedContent){
      if(error) return callback(error);
      doc.content = formattedContent;
      if(doc.updatedDate) doc.updatedDate = this.formatDate(doc.updatedDate);
      return callback(null, doc);
    });
  };

  this.handleError = function(response, error){
    console.error(error);
    response.render('layout.html', {title: 'Error', error: error, partials: {body: 'error.html', login: 'login.html'}});
  };

  this.handleAJAXError = function(response, error){
    console.error(error);
    response.send(500, error);
  };

  //main page routes
  app.get('/wiki', function(request, response){
    request.session.currentPage = request.path;
    store.listWikiPages(function(error, content){
      if(error) this.handleError(response, error);
      response.render('layout.html', {title: 'Wiki', pages: content, partials: {login: 'login.html', content: 'list.html'}});
    });
  });

  app.get('/wiki/view/:page', function(request, response){
    var page = request.params.page;
    request.session.currentPage = request.path;
    store.getWikiContents(page, function(error, doc){
      if(error) return this.handleError(response, error);
      this.formatHtmlDoc(doc, function(err, formattedDoc){
        if(err) return this.handleError(response, err);
        response.render('layout.html', {page: page, title: page, doc: formattedDoc, partials: {login: 'login.html', content: 'view.html'}});
      });
    });
  });

  app.get('/wiki/edit/:page', this.checkAuthenticated, function(request, response){
    var page = request.params.page;
    request.session.currentPage = request.path;
    store.getWikiContents(page, function(error, doc){
      if(error) return this.handleError(response, error);
      response.render('layout.html', {page: page, title: 'Edit '+page, doc: doc, partials: {login: 'login.html', content: 'edit.html'}});
    });
  });

  app.post('/wiki/add', function(request, response){
    response.redirect('/wiki/edit/'+request.body.title);
  });

  //AJAX routes
  app.post('/preview', function(request, response){
    this.formatHtmlString(request.body.content, function(error, htmlContent){
      if(error) return this.handleAJAXError(response, error);
      response.contentType('json');
      response.send({preview: htmlContent});
    });
  });

  app.post('/save', this.checkAuthenticated, function(request, response){
    var args = {_id: request.body.page, content: request.body.content, comment: request.body.comment, user: request.user.name, updatedDate: new Date()};
    if(request.body.revision) args._rev = request.body.revision;
    store.saveWikiContents(args, function(error, status){
      if(error && error.message === "conflict") return this.showCompareContent(request, response, args);
      else if(error) return this.handleAJAXError(response, error);
      response.send({status: 'saved'});
    });
  });

  this.showCompareContent = function(request, response, args){
    store.getWikiContents(args._id, function(error, doc){
      if(error) this.handleAJAXError(response, error);
      args.comparecomment = doc.comment;
      args.username = doc.user;
      args.comparedate = this.formatDate(doc.updatedDate);
      args.revision = doc._rev;
      var diff = jsdiff.diffLines(args.content, doc.content);
      args.comparecontent = '';
      diff.forEach(function(part){
        var style = part.added ? 'added' : part.removed ? 'removed' : 'common';
        args.comparecontent += '<span class="'+style+ '">' + part.value + '</span>';
      });
      response.contentType('json');
      response.send(409, args);
    });
  };
};
