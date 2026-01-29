#include "bindings/bindings.h"
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

// Forward declaration for Swift class
@class SafeAreaPlugin;

WKWebView* findWebView(UIView* view) {
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView*)view;
    }
    for (UIView* subview in view.subviews) {
        WKWebView* found = findWebView(subview);
        if (found) return found;
    }
    return nil;
}

void configureWebViewSafeArea() {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        UIWindowScene* windowScene = (UIWindowScene*)[[UIApplication sharedApplication].connectedScenes anyObject];
        UIWindow* window = windowScene.windows.firstObject;
        UIViewController* rootVC = window.rootViewController;

        if (rootVC) {
            rootVC.edgesForExtendedLayout = UIRectEdgeAll;

            // Get the current safe area insets and negate the bottom one
            UIEdgeInsets safeArea = rootVC.view.safeAreaInsets;
            rootVC.additionalSafeAreaInsets = UIEdgeInsetsMake(0, 0, -safeArea.bottom, 0);

            WKWebView* webView = findWebView(rootVC.view);
            if (webView) {
                webView.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
            }
        }
    });
}

int main(int argc, char * argv[]) {
    dispatch_async(dispatch_get_main_queue(), ^{
        configureWebViewSafeArea();
    });
    ffi::start_app();
    return 0;
}
