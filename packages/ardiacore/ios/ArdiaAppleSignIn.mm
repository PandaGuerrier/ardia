#import "ArdiaAppleSignIn.h"

#import <dlfcn.h>
#import <objc/message.h>
#import <os/log.h>

#import "ArdiaInternal.h"

@interface ArdiaAppleSignInSession : NSObject
@property(nonatomic, weak) ArdiaCoreTab *tab;
@property(nonatomic, copy) NSString *url;
@property(nonatomic, strong) id authorization;
@property(nonatomic, strong) NSWindow *sheet;
@property(nonatomic, weak) NSWindow *parent;
@property(nonatomic, strong) id sheetCloseObserver;
@property(nonatomic) BOOL finished;
@end

namespace {

void Log(NSString *line) {
  os_log(OS_LOG_DEFAULT, "[ardia] apple sign-in: %{public}@", line);
  fprintf(stderr, "[ardia] apple sign-in: %s\n", line.UTF8String);
}

Class AuthorizationClass() {
  static Class cls = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    if (dlopen("/System/Library/PrivateFrameworks/AppSSO.framework/AppSSO", RTLD_LAZY)) cls = NSClassFromString(@"SOAuthorization");
  });
  return cls;
}

NSMutableDictionary<NSNumber *, ArdiaAppleSignInSession *> *Sessions() {
  static NSMutableDictionary *sessions = [NSMutableDictionary dictionary];
  return sessions;
}

NSMapTable<ArdiaCoreTab *, NSMutableSet<NSString *> *> *HandledURLs() {
  static NSMapTable *handled = [NSMapTable weakToStrongObjectsMapTable];
  return handled;
}

bool LooksLikeAuthorizeURL(NSString *url) {
  NSURLComponents *c = [NSURLComponents componentsWithString:url];
  if (![c.scheme.lowercaseString isEqualToString:@"https"]) return false;
  if (![c.host.lowercaseString isEqualToString:@"appleid.apple.com"]) return false;
  return [c.path hasPrefix:@"/auth/authorize"] || [c.path hasPrefix:@"/auth/oauth2/authorize"] ||
         [c.path hasPrefix:@"/auth/oauth2/v2/authorize"];
}

bool CanAuthorize(NSURL *url) {
  Class cls = AuthorizationClass();
  SEL sel = NSSelectorFromString(@"canPerformAuthorizationWithURL:responseCode:");
  if (!cls || ![cls respondsToSelector:sel]) return false;
  return ((BOOL(*)(id, SEL, NSURL *, NSInteger))objc_msgSend)(cls, sel, url, 0);
}

NSString *JSONString(NSString *value) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:@[ value ] options:0 error:nil];
  NSString *array = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"[\"\"]";
  return [array substringWithRange:NSMakeRange(1, array.length - 2)];
}

NSString *DecodedBody(NSHTTPURLResponse *response, NSData *body) {
  NSStringEncoding encoding = NSUTF8StringEncoding;
  if (response.textEncodingName.length) {
    CFStringEncoding cf = CFStringConvertIANACharSetNameToEncoding((__bridge CFStringRef)response.textEncodingName);
    if (cf != kCFStringEncodingInvalidId) encoding = CFStringConvertEncodingToNSStringEncoding(cf);
  }
  return [[NSString alloc] initWithData:body encoding:encoding] ?: [[NSString alloc] initWithData:body encoding:NSISOLatin1StringEncoding];
}

}

@implementation ArdiaAppleSignInSession

- (void)start:(NSString *)origin popup:(BOOL)popup {
  id authorization = [AuthorizationClass() new];
  _authorization = authorization;
  [authorization setValue:self forKey:@"delegate"];
  ((void (*)(id, SEL, dispatch_queue_t))objc_msgSend)(authorization, NSSelectorFromString(@"setDelegateDispatchQueue:"), dispatch_get_main_queue());
  NSDictionary *options = @{
    @"SOAuthorizationOptionUserActionInitiated" : @YES,
    @"SOAuthorizationOptionInitiatorOrigin" : origin ?: @"",
    @"SOAuthorizationOptionInitiatingAction" : @(popup ? 1 : 0),
  };
  ((void (*)(id, SEL, NSDictionary *))objc_msgSend)(authorization, NSSelectorFromString(@"setAuthorizationOptions:"), options);
  Log([NSString stringWithFormat:@"begin (%@, initiator %@)", popup ? @"popup" : @"page", origin.length ? origin : @"unknown"]);
  ((void (*)(id, SEL, NSURL *, NSDictionary *, NSData *))objc_msgSend)(
      authorization, NSSelectorFromString(@"beginAuthorizationWithURL:httpHeaders:httpBody:"), [NSURL URLWithString:_url], @{}, nil);
}

- (void)end:(NSString *)why {
  if (_finished) return;
  _finished = YES;
  Log(why);
  [self dismissSheet];
  ArdiaCoreTab *tab = _tab;
  if (tab && Sessions()[@(tab.tabId)] == self) [Sessions() removeObjectForKey:@(tab.tabId)];
  _authorization = nil;
}

- (void)dismissSheet {
  if (_sheetCloseObserver) [NSNotificationCenter.defaultCenter removeObserver:_sheetCloseObserver];
  _sheetCloseObserver = nil;
  NSWindow *sheet = _sheet;
  _sheet = nil;
  if (sheet.sheetParent) [sheet.sheetParent endSheet:sheet];
  [sheet orderOut:nil];
}

- (void)authorization:(id)authorization presentViewController:(NSViewController *)controller withCompletion:(void (^)(BOOL, NSError *))completion {
  NSWindow *parent = _tab.view.window;
  if (!parent || ardia_host::Background()) {
    Log(parent ? @"background instance: not presenting the Apple sheet" : @"no window to present the Apple sheet on");
    completion(NO, nil);
    return;
  }
  [self dismissSheet];
  NSWindow *sheet = [NSWindow windowWithContentViewController:controller];
  _sheet = sheet;
  _parent = parent;
  __weak ArdiaAppleSignInSession *weakSelf = self;
  _sheetCloseObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowWillCloseNotification
                                                                        object:sheet
                                                                         queue:NSOperationQueue.mainQueue
                                                                    usingBlock:^(NSNotification *) {
                                                                      ArdiaAppleSignInSession *session = weakSelf;
                                                                      if (!session || session.finished) return;
                                                                      ((void (*)(id, SEL))objc_msgSend)(session.authorization, NSSelectorFromString(@"cancelAuthorization"));
                                                                    }];
  [parent beginSheet:sheet completionHandler:nil];
  completion(YES, nil);
}

- (void)authorizationDidNotHandle:(id)authorization {
  [self end:@"not handled, the page's own sign-in stays"];
}

- (void)authorizationDidCancel:(id)authorization {
  [self end:@"cancelled, the page's own sign-in stays"];
}

- (void)authorizationDidComplete:(id)authorization {
  [self end:@"completed without a response"];
}

- (void)authorization:(id)authorization didCompleteWithError:(NSError *)error {
  [self end:[@"failed: " stringByAppendingString:error.description ?: @"unknown"]];
}

- (void)authorization:(id)authorization didCompleteWithHTTPAuthorizationHeaders:(NSDictionary *)headers {
  [self end:@"completed with authorization headers, which a page can't take"];
}

- (void)authorization:(id)authorization didCompleteWithHTTPResponse:(NSHTTPURLResponse *)response httpBody:(NSData *)body {
  ArdiaCoreTab *tab = _tab;
  NSString *expected = _url;
  [self end:[NSString stringWithFormat:@"completed with HTTP %ld", (long)response.statusCode]];
  if (!tab || tab.closed || ![tab.url isEqualToString:expected]) return Log(@"the page moved on, dropping the response");
  NSString *location = response.allHeaderFields[@"Location"] ?: response.allHeaderFields[@"location"];
  if (response.statusCode >= 300 && response.statusCode < 400 && location.length) {
    NSURL *target = [NSURL URLWithString:location relativeToURL:response.URL ?: [NSURL URLWithString:expected]];
    if (target.absoluteString.length) [tab loadURL:target.absoluteString userInitiated:NO];
    return;
  }
  NSString *html = body.length ? DecodedBody(response, body) : nil;
  if (!html.length) return Log(@"empty response body");
  [ArdiaAppleSignInSession deliver:html toTab:tab];
}

+ (void)deliver:(NSString *)html toTab:(ArdiaCoreTab *)tab {
  NSString *code = [NSString stringWithFormat:
      @"(() => { try { window.stop(); "
      @"const parsed = new DOMParser().parseFromString(%@, 'text/html'); "
      @"document.documentElement.replaceWith(document.adoptNode(parsed.documentElement)); "
      @"const scripts = [...document.querySelectorAll('script')].filter(s => !s.src && (!s.type || /javascript|module/i.test(s.type))).map(s => s.textContent); "
      @"const external = [...document.querySelectorAll('script[src]')].map(s => s.src); "
      @"const onload = document.body ? document.body.getAttribute('onload') || '' : ''; "
      @"post('result', JSON.stringify({ scripts, external, onload, forms: document.forms.length })); "
      @"} catch (e) { post('result', JSON.stringify({ error: String(e) })); } })()",
      JSONString(html)];
  __weak ArdiaCoreTab *weakTab = tab;
  NSString *url = tab.url;
  [tab evaluate:code
      completion:^(NSString *json) {
        ArdiaCoreTab *tab = weakTab;
        if (!tab || tab.closed || ![tab.url isEqualToString:url]) return;
        NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *parsed = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        if (![parsed isKindOfClass:NSDictionary.class] || parsed[@"error"]) return Log([@"couldn't place the response: " stringByAppendingString:json ?: @"no answer"]);
        NSMutableArray<NSString *> *run = [NSMutableArray array];
        for (id script in parsed[@"scripts"])
          if ([script isKindOfClass:NSString.class] && [script length]) [run addObject:script];
        for (id src in parsed[@"external"])
          if ([src isKindOfClass:NSString.class])
            [run addObject:[NSString stringWithFormat:@"(() => { const s = document.createElement('script'); s.src = %@; document.head.appendChild(s); })()", JSONString(src)]];
        NSString *onload = [parsed[@"onload"] isKindOfClass:NSString.class] ? parsed[@"onload"] : @"";
        if (onload.length) [run addObject:onload];
        if (!run.count && [parsed[@"forms"] integerValue] > 0) [run addObject:@"document.forms[0].submit()"];
        Log([NSString stringWithFormat:@"placed the response, running %lu script(s)", (unsigned long)run.count]);
        for (NSString *script in run) [tab executeJavaScript:script frame:nil];
      }];
}

@end

@implementation ArdiaAppleSignIn

+ (void)tabCommitted:(ArdiaCoreTab *)tab initiatorOrigin:(NSString *)origin popup:(BOOL)popup {
  NSString *url = tab.url;
  ArdiaAppleSignInSession *running = Sessions()[@(tab.tabId)];
  if (running && ![running.url isEqualToString:url]) {
    ((void (*)(id, SEL))objc_msgSend)(running.authorization, NSSelectorFromString(@"cancelAuthorization"));
    [running end:@"the page left the Apple sign-in"];
    running = nil;
  }
  if (running || !url.length || !LooksLikeAuthorizeURL(url)) return;
  NSMutableSet<NSString *> *handled = [HandledURLs() objectForKey:tab];
  if ([handled containsObject:url]) return;
  NSURL *parsed = [NSURL URLWithString:url];
  if (!parsed || !CanAuthorize(parsed)) return;
  if (!handled) {
    handled = [NSMutableSet set];
    [HandledURLs() setObject:handled forKey:tab];
  }
  [handled addObject:url];
  ArdiaAppleSignInSession *session = [ArdiaAppleSignInSession new];
  session.tab = tab;
  session.url = url;
  Sessions()[@(tab.tabId)] = session;
  [session start:origin popup:popup];
}

@end
