angular.module('coachella', ['ui.router', 'ui.bootstrap', 'firebase', 'firebaseHelper'])
	
	.config(function($locationProvider, $urlRouterProvider, $stateProvider){
		$urlRouterProvider.when('',  '/');
		$urlRouterProvider.when('/', '/2015'); // default to current year
		$stateProvider
			// pages
			.state('year', {
				url: '/:year',
				templateUrl: 'views/year.html',
				resolve: {
					bands: function($rootScope, $stateParams, $firebaseHelper){
						$rootScope.bands = $firebaseHelper.$get('bands/' + $stateParams.year, true);
						
						return true;
					},
				},
			})
				.state('year.group', {
					url: '/:group',
					resolve: {
						group: function($rootScope, $stateParams, $firebaseHelper){
							$rootScope.group = $firebaseHelper.$get('groups/' + $stateParams.year + '/' + $stateParams.group);
							
							$rootScope.users = $firebaseHelper.$get('users'); // @TODO: only load those in group
							
							return true;
						},
					},
				})
			.state('year:edit', {
				url: '/:year/edit',
				templateUrl: 'views/edit.html',
				resolve: {
					authorization: function($rootScope, $q){
						var deferred = $q.defer();
					
						if($rootScope.$me.uid == 'facebook:120605287' /* Murray Smith */){
							deferred.resolve();
						}else{
							deferred.reject();
						}
						
						return deferred.promise;
					},
				},
			});
	})
	
	.controller('AppCtrl', function($scope, $rootScope, $state, $q, $firebaseHelper){
		$firebaseHelper.namespace('coachellalp');
		$rootScope.$state = $state;
		
		$rootScope.$me = {};
		$rootScope.$auth = $firebaseHelper.$auth();
		$rootScope.$auth.$onAuth(function(authData){
			if(authData){
				// logging in
				$rootScope.$me = $firebaseHelper.$get('users/' + authData.uid); // fetch existing user profile
				$rootScope.$me.$inst().$update(authData); // update it w/ any changes since last login
				$rootScope.$me.$loaded().then(function(me){
					// check if user is already in a group this year, and redirect there if so
					if( ! $rootScope.group && me.groups && me.groups[$state.params.year]){
						$state.go('year.group', {year: $state.params.year, group: me.groups[$state.params.year]});
					}
				});
			}else{
				// load/refresh while not logged in, or logging out
			}
		});
	})
	.controller('BandsCtrl', function($scope, $firebaseHelper){
		$scope.vote = function(band_id, vote){
			var save = function(user_id){
				var $item = $firebaseHelper.$child($scope.bands, band_id + '/votes/' + (user_id || $scope.$me.uid) + '/vote')
				$item.$asObject().$loaded().then(function(item){
					if(item.$value == vote){
						$item.$remove();
					} else {
						$item.$set(vote);
					}
				});
			}
			if ( ! $scope.$me.uid){
				$scope.$auth.$authWithOAuthPopup('facebook').then(function(authData){
					save(authData.uid);
				}, function(error){
					console.error(error);
				});
			}else{
				save();
			}
		};
		
		$scope.filterDay   = 0;
		$scope.orderBy     = undefined;
		$scope.orderByStr  = undefined;
		$scope.orderByDir  = false;
		$scope.toggleOrder = function(key){
			if(key){
				var defaultOrderByDirs = {
					day: false,
					name: false,
					vote: true,
					score: true,
				};
				if($scope.orderByStr == key){ // already sorting by this key
					if($scope.orderByDir === defaultOrderByDirs[key]){ // we haven't yet flipped direction
						$scope.orderByDir = ! $scope.orderByDir; // flip direction
					}else{// we've already flipped direction
						// clear the sorting to default
						return $scope.toggleOrder();
					}
				}else{ // sorting by new key
					$scope.orderByDir = defaultOrderByDirs[key]; // sort by default direction
				}
			}
			
			$scope.orderByStr = key;
			
			switch(key){
				case 'vote':
					key = function(item){
						var order = -2;
						if(item.votes){
							angular.forEach(item.votes, function(vote, user_uid){
								if(user_uid == $scope.$me.uid) order = vote.vote;
							});
						}
						return order;
					};
					break;
				case undefined:
					$scope.orderBy    = ['day','$id'];
					$scope.orderByDir = false;
					return;
				case 'day':
					$scope.orderBy    = ['day','name'];
					return;
			}
			$scope.orderBy = key;
		};
		$scope.toggleOrder();
		
		
		$scope.invite = function(){
			$scope.$apply(function(){
				FB.ui({
					method: 'apprequests',
					title: 'Coachella Friends',
					message: 'Let\'s figure out which bands we all want to see this year.',
				}, function(response){
					if( ! response){
						console.error('Facebook Error: Unknown');
					}else if(response.error){
						console.error('Facebook Error: ' + response.error);
					}else{
						if(response.to){
							// build list of user uids
							var uids = {};
							uids[scope.$me.uid] = scope.$me.uid; // include self
							angular.forEach(response.to, function(fbid){ // include invitees
								var uid = 'facebook:' + fbid;
								uids[uid] = uid;
							});
							console.log(uids);
							
							// update relations
	/*
							if(scope.group){
								// group already exists, append new users
								scope.group.$update({users: uids});
							}else{
								// create new group
								$firebaseHelper.$get('groups', true).$add({year: $state.params.year, users: uids}).then(function(groupRef){
									var groupId = groupRef.key();
									$firebaseHelper.$inst('users/' + $rootScope.$me.uid + '/groups').$set(groupId, groupId).then(function(){
										$state.go('year.group', {year: $state.params.year, group: groupId});
									});
								});
							}
	*/
						}
					}
				});
			});
		}
	})
	.controller('BandCtrl', function($scope){
		$scope.init = function(band){
			$scope.data = band;
		};
		$scope.$watch('data.votes', function(votes){
			var total = 0;
			angular.forEach(votes, function(item){
				total += item.vote;
			});
			$scope.data = $scope.data || {};
			return $scope.data.score = total;
		});
		
		$scope.add = function(band){
			if(band && band.name && band.day){
				$scope.bands.$add(band).then(function(){
					// reset it
					band.name = '';
					
					// focus on input so we can quickly add more
					$scope.added = true;
				});
			}
		};
		$scope.remove = function(band, skipConfirm){
			if(band && band.$id && (skipConfirm || confirm('Are you sure you want to permanently delete this?'))){
				$scope.bands.$remove(band);
			}
		};
	})
	
	.directive('ngAutofocus', function(){
		return {
			restrict: 'A',
			link: function(scope, element, attrs){
				scope.$watch(function(){
					return scope.$eval(attrs.ngAutofocus);
				},function (v){
					if(v) element[0].focus(); // use focus function instead of autofocus attribute to avoid cross browser problem. And autofocus should only be used to mark an element to be focused when page loads.
				});
			}
		};
	})